#!/usr/bin/env tsx
/**
 * `npm run content:commits -- --product-ref <sha> [--product-repo-path <path>]`
 *
 * SOS-NOTES-V1: writes `content-bundles/inputs/product-commits.json`, the public commit ledger
 * (see `src/lib/commit-to-content/commit-ledger.ts`): the product commits this site cites —
 * changelog entries, TextOS briefs and their runs (`src/lib/commit-to-content/citations.ts`) —
 * plus the pinned tip. Run it after `content:sync`, against the same product ref and the same
 * checkout, and again whenever a citation is added: `content:verify` fails if the ledger and the
 * citations disagree in either direction.
 *
 * Every citation is resolved by `git` itself (an abbreviated SHA that is ambiguous in the full
 * history fails) and must be an ancestor of the pinned ref: a commit that exists only on another
 * branch or another machine is refused, never written.
 *
 * Same read-only contract as `content:sync`: the product repo must ALREADY be checked out with
 * its HEAD at exactly `--product-ref`; this tool never checks out, fetches, or writes anything
 * there. It refuses a shallow clone, where a real, older commit would look unreachable.
 *
 * Git plumbing only — no network, no LLM. Only sha, author date and subject are written.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { collectProductCommitCitations } from "../src/lib/commit-to-content/citations";
import {
  assertLedgerHoldsExactlyCitations,
  buildProductCommitLedger,
  serializeProductCommitLedger,
  type ProductCommit,
} from "../src/lib/commit-to-content/commit-ledger";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const INPUTS_DIR = join(REPO_ROOT, "content-bundles", "inputs");
const LEDGER_PATH = join(INPUTS_DIR, "product-commits.json");

const FIELD = "\x1f";
const CITED_SHA_RE = /^[0-9a-f]{7,40}$/;

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
    throw new Error("content-commits: --product-ref <sha> is required.");
  }
  return { productRef, productRepoPath };
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** One cited commit, as the product repository's own history reports it. */
function readCitedCommit(repo: string, productRef: string, cited: string, citedBy: string): ProductCommit {
  if (!CITED_SHA_RE.test(cited)) {
    throw new Error(`content-commits: ${citedBy} cites ${JSON.stringify(cited)}, which is not a hex SHA of at least 7 characters.`);
  }
  let sha: string;
  try {
    sha = git(repo, ["rev-parse", "--verify", "--quiet", `${cited}^{commit}`]).trim();
  } catch {
    throw new Error(`content-commits: ${citedBy} cites ${cited}, which the product repository does not resolve to exactly one commit.`);
  }
  const ancestry = spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", sha, productRef], { encoding: "utf8" });
  if (ancestry.status === 1) {
    throw new Error(`content-commits: ${citedBy} cites ${sha}, which is not in the history of the pinned product ref ${productRef}.`);
  }
  if (ancestry.status !== 0) {
    throw new Error(`content-commits: could not check the ancestry of ${sha}: ${ancestry.stderr.trim()}`);
  }
  const [full, date, subject] = git(repo, ["log", "-1", `--format=%H${FIELD}%aI${FIELD}%s`, sha]).trim().split(FIELD);
  if (full !== sha || !date || subject === undefined) {
    throw new Error(`content-commits: could not read commit ${sha}.`);
  }
  return { sha, date, subject };
}

function main(): void {
  const { productRef, productRepoPath } = parseArgs(process.argv.slice(2));

  if (!existsSync(join(productRepoPath, ".git"))) {
    throw new Error(`content-commits: no git repository found at ${productRepoPath}.`);
  }
  const actualHead = git(productRepoPath, ["rev-parse", "HEAD"]).trim();
  if (actualHead !== productRef) {
    throw new Error(
      `content-commits: refusing to proceed. Product repo at ${productRepoPath} has HEAD ${actualHead}, ` +
        `but --product-ref ${productRef} was requested. Run \`git -C ${productRepoPath} checkout ${productRef}\` ` +
        "yourself, then re-run content:commits.",
    );
  }
  if (git(productRepoPath, ["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
    throw new Error(
      `content-commits: refusing to read a shallow clone at ${productRepoPath}. A truncated history would ` +
        "make real commits look unreachable. Use a full clone (or `git fetch --unshallow`).",
    );
  }

  const citations = collectProductCommitCitations(REPO_ROOT);
  const commits = [
    readCitedCommit(productRepoPath, productRef, productRef, "the pinned product ref"),
    ...citations.map((c) => readCitedCommit(productRepoPath, productRef, c.sha, c.citedBy)),
  ];
  const ledger = buildProductCommitLedger({ productRef, commits });
  assertLedgerHoldsExactlyCitations(ledger, citations);

  mkdirSync(INPUTS_DIR, { recursive: true });
  writeFileSync(LEDGER_PATH, serializeProductCommitLedger(ledger), "utf8");

  console.log("content-commits: done.");
  console.log(`  product ref:  ${productRef}`);
  console.log(`  citations:    ${citations.length}`);
  console.log(`  commits:      ${ledger.commitCount} (cited commits and the pinned tip)`);
}

main();
