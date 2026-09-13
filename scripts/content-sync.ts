#!/usr/bin/env tsx
/**
 * `npm run content:sync -- --product-ref <sha> [--product-repo-path <path>]`
 *
 * SOS-CTC-V1, V1 simplification (disclosed in `content-bundles/README.md`): this reads the
 * product manifest by requiring the product repo, at `--product-repo-path`, to ALREADY be
 * checked out with its `HEAD` at exactly `--product-ref`. It never checks out, fetches, or
 * commits anything in that repo itself — if HEAD doesn't match, it refuses and tells the
 * operator the exact command to run. This is a deliberately narrower, safer read than
 * materializing an arbitrary ref into a throwaway worktree: it cannot leave that repo's git
 * metadata mutated if this process dies mid-run (see product-repo `git worktree list` for
 * why that risk is not hypothetical in this environment).
 *
 * Given a matching HEAD, it runs `npm run public-truth:build` there ONLY if the artifact is
 * missing (a pure, local, no-network build step that writes into that repo's git-ignored
 * `.artifacts/`, not a commit), reads the manifest + its checksum sidecar and the
 * `changes/content-impact/records/**` directory straight off disk, and hands everything to
 * the pure `runSyncEngine`. No LLM call, no network call beyond what `public-truth:build`
 * itself might need (none, today).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runSyncEngine, type RawImpactRecordFile } from "../src/lib/commit-to-content/sync-engine";
import type { SyncStatusPin } from "../src/lib/commit-to-content/status-report";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BUNDLES_DIR = join(REPO_ROOT, "content-bundles");
const INPUTS_DIR = join(BUNDLES_DIR, "inputs");
const CANDIDATES_DIR = join(REPO_ROOT, "content", "candidates");
const MANIFEST_FILE_NAME = "public-product-manifest.json";

function parseArgs(argv: string[]): { productRef: string; productRepoPath: string } {
  let productRef: string | undefined;
  let productRepoPath = resolve(REPO_ROOT, "..", "shortsos");

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--product-ref") {
      productRef = argv[++i];
    } else if (arg === "--product-repo-path") {
      productRepoPath = resolve(argv[++i] ?? "");
    }
  }

  if (!productRef) {
    throw new Error("content-sync: --product-ref <sha> is required.");
  }
  return { productRef, productRepoPath };
}

function readPreviousPin(): SyncStatusPin | null {
  const pinPath = join(BUNDLES_DIR, "pin.json");
  if (!existsSync(pinPath)) return null;
  return JSON.parse(readFileSync(pinPath, "utf8")) as SyncStatusPin;
}

function readImpactRecordFiles(productRepoPath: string): RawImpactRecordFile[] {
  const dir = join(productRepoPath, "changes", "content-impact", "records");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ label: f, raw: readFileSync(join(dir, f), "utf8") }));
}

function clearDir(dir: string): void {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".json")) rmSync(join(dir, f));
  }
}

function main(): void {
  const { productRef, productRepoPath } = parseArgs(process.argv.slice(2));

  if (!existsSync(join(productRepoPath, ".git"))) {
    throw new Error(`content-sync: no git repository found at ${productRepoPath}.`);
  }

  const actualHead = execFileSync("git", ["-C", productRepoPath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actualHead !== productRef) {
    throw new Error(
      `content-sync: refusing to proceed. Product repo at ${productRepoPath} has HEAD ${actualHead}, ` +
        `but --product-ref ${productRef} was requested. This tool never checks out a ref in the product ` +
        `repo itself (read-only against it) — run \`git -C ${productRepoPath} checkout ${productRef}\` ` +
        `yourself, then re-run content:sync.`,
    );
  }

  const manifestPath = join(productRepoPath, ".artifacts", MANIFEST_FILE_NAME);
  const sidecarPath = `${manifestPath}.sha256`;

  if (!existsSync(manifestPath) || !existsSync(sidecarPath)) {
    console.log(`content-sync: no manifest artifact found, running \`npm run public-truth:build\` in ${productRepoPath}...`);
    execFileSync("npm", ["run", "public-truth:build"], { cwd: productRepoPath, stdio: "inherit" });
  }

  if (!existsSync(manifestPath) || !existsSync(sidecarPath)) {
    throw new Error(
      `content-sync: public-truth:build did not produce ${manifestPath} (+ .sha256). Refusing to sync.`,
    );
  }

  const manifestRaw = readFileSync(manifestPath, "utf8");
  const manifestSidecarRaw = readFileSync(sidecarPath, "utf8");
  const impactRecordFiles = readImpactRecordFiles(productRepoPath);

  const output = runSyncEngine({
    productRef,
    manifestRaw,
    manifestSidecarRaw,
    manifestFileName: MANIFEST_FILE_NAME,
    impactRecordFiles,
  });

  const previousPin = readPreviousPin();

  mkdirSync(BUNDLES_DIR, { recursive: true });
  mkdirSync(INPUTS_DIR, { recursive: true });
  mkdirSync(join(INPUTS_DIR, "impact-records"), { recursive: true });
  mkdirSync(CANDIDATES_DIR, { recursive: true });

  // Deterministic outputs.
  writeFileSync(join(BUNDLES_DIR, "bundle.json"), output.serializedBundle, "utf8");
  writeFileSync(join(INPUTS_DIR, "manifest.json"), manifestRaw, "utf8");
  writeFileSync(join(INPUTS_DIR, "manifest.json.sha256"), manifestSidecarRaw, "utf8");
  writeFileSync(join(INPUTS_DIR, "pin.json"), `${JSON.stringify({ productRef }, null, 2)}\n`, "utf8");

  clearDir(join(INPUTS_DIR, "impact-records"));
  for (const f of impactRecordFiles) {
    writeFileSync(join(INPUTS_DIR, "impact-records", f.label), f.raw, "utf8");
  }

  clearDir(CANDIDATES_DIR);
  for (const [fileName, content] of Object.entries(output.candidateFiles)) {
    writeFileSync(join(CANDIDATES_DIR, fileName), content, "utf8");
  }

  // Human-facing status file — the one place a wall-clock timestamp is allowed to live.
  const newPin: SyncStatusPin = {
    productRef,
    manifestChecksum: output.manifestChecksum,
    syncedAt: new Date().toISOString(),
    previousProductRef: previousPin?.productRef ?? null,
  };
  writeFileSync(join(BUNDLES_DIR, "pin.json"), `${JSON.stringify(newPin, null, 2)}\n`, "utf8");

  console.log("content-sync: done.");
  console.log(`  product ref:        ${productRef}`);
  console.log(`  manifest checksum:  ${output.manifestChecksum}`);
  console.log(`  entities:           ${output.bundle.manifestEntityCount}`);
  console.log(`  candidate entities: ${output.bundle.candidateEntities.length}`);
  console.log(`  impact records:     ${output.bundle.impactRecords.length}`);
  console.log(`  impacted surfaces:  ${output.bundle.impactedSurfaces.join(", ") || "(none)"}`);
  if (previousPin) {
    console.log(
      previousPin.productRef === productRef
        ? "  (same product ref as previous sync — re-verified, output unchanged if inputs were unchanged)"
        : `  (previous product ref was ${previousPin.productRef})`,
    );
  } else {
    console.log("  (no previous sync — this is the first content-bundles snapshot)");
  }
}

main();
