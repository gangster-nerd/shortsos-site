#!/usr/bin/env tsx
/**
 * `npm run content:verify` — fully deterministic, zero product-repo access, zero network.
 * Re-verifies the pinned manifest's digest+provenance, re-derives the content bundle and
 * candidate files from the pinned inputs committed under `content-bundles/inputs/**`, and
 * diffs the result byte-for-byte against what's actually committed
 * (`content-bundles/bundle.json` + `content/candidates/**`). Fails loudly on any mismatch —
 * this is what CI runs, and CI has no `../shortsos` checkout to read, by design.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { collectProductCommitCitations } from "../src/lib/commit-to-content/citations";
import {
  assertLedgerHoldsExactlyCitations,
  assertLedgerMatchesPin,
  parseProductCommitLedger,
} from "../src/lib/commit-to-content/commit-ledger";
import { runSyncEngine, type RawImpactRecordFile } from "../src/lib/commit-to-content/sync-engine";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BUNDLES_DIR = join(REPO_ROOT, "content-bundles");
const INPUTS_DIR = join(BUNDLES_DIR, "inputs");
const CANDIDATES_DIR = join(REPO_ROOT, "content", "candidates");
const MANIFEST_FILE_NAME = "public-product-manifest.json";

function fail(message: string): never {
  console.error(`content-verify: FAIL — ${message}`);
  process.exit(1);
}

function main(): void {
  const pinPath = join(INPUTS_DIR, "pin.json");
  const manifestPath = join(INPUTS_DIR, "manifest.json");
  const sidecarPath = join(INPUTS_DIR, "manifest.json.sha256");
  const bundlePath = join(BUNDLES_DIR, "bundle.json");

  if (!existsSync(pinPath) || !existsSync(manifestPath) || !existsSync(sidecarPath) || !existsSync(bundlePath)) {
    fail(
      `no pinned content-sync inputs found under ${INPUTS_DIR} (and/or ${bundlePath} missing). ` +
        `Run \`npm run content:sync -- --product-ref <sha>\` at least once first.`,
    );
  }

  const { productRef } = JSON.parse(readFileSync(pinPath, "utf8")) as { productRef: string };
  const manifestRaw = readFileSync(manifestPath, "utf8");
  const manifestSidecarRaw = readFileSync(sidecarPath, "utf8");

  const impactRecordsDir = join(INPUTS_DIR, "impact-records");
  const impactRecordFiles: RawImpactRecordFile[] = existsSync(impactRecordsDir)
    ? readdirSync(impactRecordsDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => ({ label: f, raw: readFileSync(join(impactRecordsDir, f), "utf8") }))
    : [];

  let output;
  try {
    output = runSyncEngine({
      productRef,
      manifestRaw,
      manifestSidecarRaw,
      manifestFileName: MANIFEST_FILE_NAME,
      impactRecordFiles,
    });
  } catch (err) {
    fail(`pinned manifest failed re-verification: ${(err as Error).message}`);
  }

  const committedBundle = readFileSync(bundlePath, "utf8");
  if (output.serializedBundle !== committedBundle) {
    fail(
      `re-derived content-bundles/bundle.json does not match what's committed. ` +
        `The pinned inputs and the committed bundle have drifted apart — re-run content:sync.`,
    );
  }

  const committedCandidateFiles = existsSync(CANDIDATES_DIR)
    ? readdirSync(CANDIDATES_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const expectedCandidateFiles = Object.keys(output.candidateFiles).sort();

  if (JSON.stringify(committedCandidateFiles.sort()) !== JSON.stringify(expectedCandidateFiles)) {
    fail(
      `committed content/candidates/**.json files (${committedCandidateFiles.join(", ") || "none"}) ` +
        `do not match the pinned inputs' derived set (${expectedCandidateFiles.join(", ") || "none"}).`,
    );
  }
  for (const [fileName, expectedContent] of Object.entries(output.candidateFiles)) {
    const actualContent = readFileSync(join(CANDIDATES_DIR, fileName), "utf8");
    if (actualContent !== expectedContent) {
      fail(`content/candidates/${fileName} does not match the pinned inputs' derived content.`);
    }
  }

  // SOS-NOTES-V1: the commit ledger every commit citation resolves against must describe the
  // exact same product ref as the manifest pin, be in canonical (unedited) form, and hold exactly
  // the commits this site cites — no fewer (a citation would not resolve), no more (this
  // repository is public; the product repository is not).
  const ledgerPath = join(INPUTS_DIR, "product-commits.json");
  if (!existsSync(ledgerPath)) {
    fail(`no commit ledger at ${ledgerPath}. Run \`npm run content:commits -- --product-ref ${productRef}\`.`);
  }
  let commitCount = 0;
  try {
    const ledger = parseProductCommitLedger(readFileSync(ledgerPath, "utf8"));
    assertLedgerMatchesPin(ledger, productRef);
    assertLedgerHoldsExactlyCitations(ledger, collectProductCommitCitations(REPO_ROOT));
    commitCount = ledger.commitCount;
  } catch (err) {
    fail(`commit ledger failed re-verification: ${(err as Error).message}`);
  }

  console.log("content-verify: OK");
  console.log(`  product ref:        ${productRef}`);
  console.log(`  manifest checksum:  ${output.manifestChecksum}`);
  console.log(`  candidate entities: ${output.bundle.candidateEntities.length}`);
  console.log(`  ledger commits:     ${commitCount} (cited commits and the pinned tip)`);
}

main();
