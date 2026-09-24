import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { collectProductCommitCitations } from "../src/lib/commit-to-content/citations";
import {
  CommitLedgerError,
  assertLedgerHoldsExactlyCitations,
  assertLedgerMatchesPin,
  authorDay,
  buildProductCommitLedger,
  parseProductCommitLedger,
  resolveCitedCommit,
  serializeProductCommitLedger,
  type ProductCommit,
} from "../src/lib/commit-to-content/commit-ledger";
import { CHANGELOG_ENTRIES } from "../src/content/copy-sources";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const TIP = "a".repeat(40);
const OLDER = "b".repeat(40);

const THIRD = "c".repeat(40);

function commit(sha: string, date: string): ProductCommit {
  return { sha, date, subject: `subject ${sha.slice(0, 7)}` };
}

describe("commit ledger — pure construction", () => {
  it("is deterministic regardless of input order, newest first, duplicates collapsed", () => {
    const a = buildProductCommitLedger({
      productRef: TIP,
      commits: [commit(OLDER, "2026-09-01T10:00:00+02:00"), commit(TIP, "2026-09-02T10:00:00+02:00"), commit(OLDER, "2026-09-01T10:00:00+02:00")],
    });
    const b = buildProductCommitLedger({
      productRef: TIP,
      commits: [commit(TIP, "2026-09-02T10:00:00+02:00"), commit(OLDER, "2026-09-01T10:00:00+02:00")],
    });
    expect(serializeProductCommitLedger(a)).toBe(serializeProductCommitLedger(b));
    expect(a.commits.map((c) => c.sha)).toEqual([TIP, OLDER]);
  });

  it("refuses a commit carrying anything beyond sha, date and subject (no paths, no bodies in a public file)", () => {
    const withPaths = { ...commit(TIP, "2026-09-02T10:00:00Z"), paths: ["src/private.ts"] } as ProductCommit;
    expect(() => buildProductCommitLedger({ productRef: TIP, commits: [withPaths] })).toThrow(/must not hold: paths/);
  });

  it("refuses a ledger that does not contain its own tip", () => {
    expect(() => buildProductCommitLedger({ productRef: TIP, commits: [commit(OLDER, "2026-09-01T10:00:00Z")] })).toThrow(
      CommitLedgerError,
    );
  });

  it("refuses abbreviated SHAs and non-ISO dates", () => {
    expect(() => buildProductCommitLedger({ productRef: TIP, commits: [commit("abc1234", "2026-09-01T10:00:00Z")] })).toThrow(
      /full 40-hex/,
    );
    expect(() => buildProductCommitLedger({ productRef: TIP, commits: [commit(TIP, "2026-09-01")] })).toThrow(/ISO 8601/);
  });

  it("refuses the same sha twice with different data", () => {
    expect(() =>
      buildProductCommitLedger({
        productRef: TIP,
        commits: [commit(TIP, "2026-09-01T10:00:00Z"), { ...commit(TIP, "2026-09-01T10:00:00Z"), subject: "rewritten" }],
      }),
    ).toThrow(/twice/);
  });
});

describe("commit ledger — parse and resolve", () => {
  const ledger = buildProductCommitLedger({
    productRef: TIP,
    commits: [commit(TIP, "2026-09-02T23:30:00+02:00"), commit(OLDER, "2026-09-01T10:00:00+02:00")],
  });
  const raw = serializeProductCommitLedger(ledger);

  it("round-trips its own canonical serialization", () => {
    expect(parseProductCommitLedger(raw)).toEqual(ledger);
  });

  it("refuses a hand-edited ledger (reordered commits)", () => {
    const edited = JSON.parse(raw) as { commits: ProductCommit[] };
    edited.commits.reverse();
    expect(() => parseProductCommitLedger(`${JSON.stringify(edited, null, 2)}\n`)).toThrow(/canonical form/);
  });

  it("resolves full and abbreviated citations, and refuses unknown or too-short ones", () => {
    expect(resolveCitedCommit(ledger, TIP).sha).toBe(TIP);
    expect(resolveCitedCommit(ledger, OLDER.slice(0, 7)).sha).toBe(OLDER);
    expect(() => resolveCitedCommit(ledger, "c".repeat(7))).toThrow(/not reachable/);
    expect(() => resolveCitedCommit(ledger, "aaaa")).toThrow(/at least 7/);
  });

  it("reports the author's own calendar day, not a UTC-shifted one", () => {
    expect(authorDay(ledger.commits[0]!)).toBe("2026-09-02");
  });

  it("refuses a ledger pinned to a different product ref than the manifest", () => {
    expect(() => assertLedgerMatchesPin(ledger, OLDER)).toThrow(/pinned to/);
  });

  it("holds exactly the citations: an uncited commit or an unresolved citation is refused", () => {
    expect(() => assertLedgerHoldsExactlyCitations(ledger, [{ sha: OLDER.slice(0, 7), citedBy: "a note" }])).not.toThrow();
    expect(() => assertLedgerHoldsExactlyCitations(ledger, [])).toThrow(/nothing on this site cites \(bbbbbbb\)/);
    expect(() => assertLedgerHoldsExactlyCitations(ledger, [{ sha: OLDER, citedBy: "a note" }, { sha: THIRD, citedBy: "another note" }])).toThrow(
      /another note: cited commit c{40} is not reachable/,
    );
  });
});

describe("the committed ledger (SOS-NOTES-V1)", () => {
  const raw = readFileSync(resolve(REPO_ROOT, "content-bundles/inputs/product-commits.json"), "utf8");
  const pin = JSON.parse(readFileSync(resolve(REPO_ROOT, "content-bundles/inputs/pin.json"), "utf8")) as { productRef: string };
  const ledger = parseProductCommitLedger(raw);

  it("is canonical and walked from exactly the manifest pin", () => {
    assertLedgerMatchesPin(ledger, pin.productRef);
    expect(ledger.commits[0]?.sha).toBe(pin.productRef);
  });

  it("holds exactly the product commits this site cites, plus the pinned tip", () => {
    expect(() => assertLedgerHoldsExactlyCitations(ledger, collectProductCommitCitations(REPO_ROOT))).not.toThrow();
  });

  it("resolves every product-repo changelog citation, on the date the entry claims", () => {
    for (const entry of CHANGELOG_ENTRIES.filter((e) => e.repo === "shortsos")) {
      const resolved = resolveCitedCommit(ledger, entry.sha);
      expect(authorDay(resolved), `${entry.title} cites ${entry.sha}`).toBe(entry.date);
    }
  });
});
