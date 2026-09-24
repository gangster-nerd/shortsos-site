/**
 * Product commit ledger (SOS-NOTES-V1): the product commits this site CITES — changelog entries,
 * Insights sources, TextOS brief evidence — plus the pinned tip, each verified by `git` to be part
 * of the history reachable from the pinned product ref, as `git` itself reports it: sha, author
 * date, subject. Nothing else: this repository is public and the product repository is not, so no
 * commit bodies, no changed paths and no uncited commit ever land here.
 *
 * Why it exists: every piece of content on this site that cites a product commit (a
 * changelog entry, a developer note) must cite a commit that really exists in the product's
 * publishable history — not a SHA typed from memory, and not a commit that only ever existed
 * on one machine (the exact failure the product repo's own T0-PUBLIC-TRUTH-BASELINE-REPAIR,
 * 36122a2, had to clean up in its evidence bundles). `content:verify` and the test suite
 * resolve citations against this committed ledger with zero product-repo access and zero
 * network, the same sync/verify split `content:sync` already uses for the manifest.
 *
 * Pure module: no filesystem, no process, no clock. `scripts/content-commits.ts` does the git
 * I/O; everything below is deterministic over its inputs.
 */

export const LEDGER_VERSION = 1 as const;

export interface ProductCommit {
  /** Full 40-hex commit SHA. */
  sha: string;
  /** Author date, strict ISO 8601 with the author's own UTC offset (`git log --format=%aI`). */
  date: string;
  subject: string;
}

export interface ProductCommitLedger {
  ledgerVersion: typeof LEDGER_VERSION;
  /** The product ref the ledger was walked from. Must equal the manifest pin. */
  productRef: string;
  commitCount: number;
  /** The cited commits (and the tip), newest first (author date desc, then sha asc). */
  commits: ProductCommit[];
}

export class CommitLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitLedgerError";
  }
}

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const SHORT_SHA_RE = /^[0-9a-f]{7,40}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

export function isFullSha(value: string): boolean {
  return FULL_SHA_RE.test(value);
}

function compareCommits(a: ProductCommit, b: ProductCommit): number {
  const byDate = Date.parse(b.date) - Date.parse(a.date);
  if (byDate !== 0) return byDate;
  return a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0;
}

function validateCommit(raw: unknown, index: number): ProductCommit {
  if (typeof raw !== "object" || raw === null) {
    throw new CommitLedgerError(`commits[${index}] is not an object.`);
  }
  const c = raw as Record<string, unknown>;
  if (typeof c.sha !== "string" || !isFullSha(c.sha)) {
    throw new CommitLedgerError(`commits[${index}].sha is not a full 40-hex SHA: ${JSON.stringify(c.sha)}`);
  }
  if (typeof c.date !== "string" || !ISO_DATE_RE.test(c.date) || Number.isNaN(Date.parse(c.date))) {
    throw new CommitLedgerError(`commits[${index}] (${c.sha}) has no strict ISO 8601 "date": ${JSON.stringify(c.date)}`);
  }
  if (typeof c.subject !== "string" || c.subject.length === 0) {
    throw new CommitLedgerError(`commits[${index}] (${c.sha}) has no "subject".`);
  }
  const extra = Object.keys(c).filter((k) => !["sha", "date", "subject"].includes(k));
  if (extra.length > 0) {
    throw new CommitLedgerError(`commits[${index}] (${c.sha}) carries fields the public ledger must not hold: ${extra.join(", ")}.`);
  }
  return { sha: c.sha, date: c.date, subject: c.subject };
}

/**
 * Pure, deterministic construction: dedupes by sha (a duplicate with different data is a
 * tooling bug and throws), sorts commits, and refuses a ledger that does not contain its own
 * productRef.
 */
export function buildProductCommitLedger(input: { productRef: string; commits: ProductCommit[] }): ProductCommitLedger {
  if (!isFullSha(input.productRef)) {
    throw new CommitLedgerError(`productRef is not a full 40-hex SHA: ${JSON.stringify(input.productRef)}`);
  }
  const bySha = new Map<string, ProductCommit>();
  input.commits.forEach((raw, i) => {
    const normalized: ProductCommit = validateCommit(raw, i);
    const existing = bySha.get(normalized.sha);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new CommitLedgerError(`commit ${normalized.sha} appears twice with different data.`);
    }
    bySha.set(normalized.sha, normalized);
  });
  if (!bySha.has(input.productRef)) {
    throw new CommitLedgerError(`ledger does not contain its own productRef ${input.productRef}.`);
  }
  const commits = [...bySha.values()].sort(compareCommits);
  return { ledgerVersion: LEDGER_VERSION, productRef: input.productRef, commitCount: commits.length, commits };
}

export function serializeProductCommitLedger(ledger: ProductCommitLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

/** Strict, fail-closed parse of a committed ledger file. Re-derives through
 *  `buildProductCommitLedger` and refuses any byte difference, so a hand-edited ledger (a
 *  commit inserted, a date nudged, order changed) fails instead of being trusted. */
export function parseProductCommitLedger(raw: string): ProductCommitLedger {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CommitLedgerError(`ledger is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new CommitLedgerError("ledger is not a JSON object.");
  }
  const l = parsed as Record<string, unknown>;
  if (l.ledgerVersion !== LEDGER_VERSION) {
    throw new CommitLedgerError(`unknown ledgerVersion ${JSON.stringify(l.ledgerVersion)}; this tooling only reads ${LEDGER_VERSION}.`);
  }
  if (typeof l.productRef !== "string") {
    throw new CommitLedgerError('ledger has no string "productRef".');
  }
  if (!Array.isArray(l.commits)) {
    throw new CommitLedgerError('ledger has no "commits" array.');
  }
  if (l.commitCount !== l.commits.length) {
    throw new CommitLedgerError(`ledger commitCount (${String(l.commitCount)}) does not match commits.length (${l.commits.length}).`);
  }
  const ledger = buildProductCommitLedger({ productRef: l.productRef, commits: l.commits as ProductCommit[] });
  if (serializeProductCommitLedger(ledger) !== raw) {
    throw new CommitLedgerError(
      "ledger is not in canonical form (order, dedupe or formatting differs from what content:commits writes). " +
        "It may have been edited by hand — re-run content:commits instead.",
    );
  }
  return ledger;
}

/** The ledger must describe exactly the product ref the manifest is pinned to. */
export function assertLedgerMatchesPin(ledger: ProductCommitLedger, pinnedProductRef: string): void {
  if (ledger.productRef !== pinnedProductRef) {
    throw new CommitLedgerError(
      `commit ledger was walked from ${ledger.productRef}, but the manifest is pinned to ${pinnedProductRef}. ` +
        "Re-run `npm run content:commits` against the same product ref as `content:sync`.",
    );
  }
}

/**
 * Resolves a cited SHA — full, or an abbreviated prefix of at least 7 hex digits — to exactly
 * one ledger commit. An unknown or ambiguous citation throws: it is never guessed.
 */
export function resolveCitedCommit(ledger: ProductCommitLedger, cited: string): ProductCommit {
  const needle = cited.toLowerCase();
  if (!SHORT_SHA_RE.test(needle)) {
    throw new CommitLedgerError(`cited commit ${JSON.stringify(cited)} is not a hex SHA of at least 7 characters.`);
  }
  const matches = ledger.commits.filter((c) => c.sha.startsWith(needle));
  if (matches.length === 0) {
    throw new CommitLedgerError(
      `cited commit ${cited} is not reachable from the pinned product ref ${ledger.productRef}. ` +
        "Either it does not exist, or it lives outside the product's publishable history.",
    );
  }
  if (matches.length > 1) {
    throw new CommitLedgerError(`cited commit ${cited} is ambiguous (${matches.length} ledger commits share that prefix).`);
  }
  return matches[0]!;
}

export interface CommitCitation {
  /** Full or abbreviated (at least 7 hex) SHA, exactly as the citing content writes it. */
  sha: string;
  /** Where the citation lives, for error messages. */
  citedBy: string;
}

/**
 * The public ledger holds exactly what this site cites: every citation resolves to one ledger
 * commit, and every ledger commit other than the pinned tip is cited at least once. The second
 * half is the privacy half — an uncited product commit has no business in a public file.
 */
export function assertLedgerHoldsExactlyCitations(ledger: ProductCommitLedger, citations: CommitCitation[]): void {
  const cited = new Set<string>([ledger.productRef]);
  for (const citation of citations) {
    try {
      cited.add(resolveCitedCommit(ledger, citation.sha).sha);
    } catch (err) {
      throw new CommitLedgerError(`${citation.citedBy}: ${(err as Error).message}`);
    }
  }
  const uncited = ledger.commits.filter((c) => !cited.has(c.sha));
  if (uncited.length > 0) {
    throw new CommitLedgerError(
      `ledger holds ${uncited.length} commit(s) nothing on this site cites (${uncited.map((c) => c.sha.slice(0, 7)).join(", ")}). ` +
        "This repository is public — re-run content:commits, which writes cited commits only.",
    );
  }
}

/** The calendar date the author recorded, in the author's own offset (`YYYY-MM-DD`). */
export function authorDay(commit: ProductCommit): string {
  return commit.date.slice(0, 10);
}
