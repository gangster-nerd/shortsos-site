/**
 * SOS-CTC-V2 proof: does the sync mechanism handle the NEXT governed change without
 * redesign?
 *
 * Real-change check performed for this mission: `git fetch origin` in the product repo,
 * then `git log f01ac6110ec664aba31ee985a4c30d307de10b2f..origin/main --oneline` — empty.
 * `origin/main` is at exactly f01ac611, the SHA already pinned in
 * `content-bundles/pin.json`. No real new governed change exists yet, so this test proves
 * the mechanism generically with a deterministic, clearly-namespaced fixture
 * (`tests/fixtures/ctc-v2-next-change.fixture.ts`) fed straight into the existing, pure
 * `runSyncEngine` library function — the exact function `scripts/content-sync.ts` calls,
 * used here with no filesystem writes and no product-repo checkout required.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { runSyncEngine } from "../src/lib/commit-to-content/sync-engine";
import {
  FIXTURE_ENTITY_ID,
  buildFixtureAfterInputs,
  buildFixtureBeforeInputs,
} from "./fixtures/ctc-v2-next-change.fixture";

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("SOS-CTC-V2: the sync engine handles the next governed change without redesign", () => {
  it("is idempotent for the 'before' (still-candidate) state", () => {
    const inputs = buildFixtureBeforeInputs();
    const first = runSyncEngine(inputs);
    const second = runSyncEngine(inputs);
    expect(second.serializedBundle).toBe(first.serializedBundle);
    expect(Object.keys(first.candidateFiles)).toEqual([`${FIXTURE_ENTITY_ID}.json`]);
  });

  it("is idempotent for the 'after' (promoted) state", () => {
    const inputs = buildFixtureAfterInputs();
    const first = runSyncEngine(inputs);
    const second = runSyncEngine(inputs);
    expect(second.serializedBundle).toBe(first.serializedBundle);
  });

  it("diffs correctly: promotion removes the entity from candidateFiles and adds it to impactedSurfaces", () => {
    const before = runSyncEngine(buildFixtureBeforeInputs());
    const after = runSyncEngine(buildFixtureAfterInputs());

    // Before: gated as a candidate, not yet claimable on any surface.
    expect(Object.keys(before.candidateFiles)).toContain(`${FIXTURE_ENTITY_ID}.json`);
    expect(before.bundle.impactedSurfaces).toEqual([]);

    // After: promoted out of the candidate set, and the real-shaped impact record
    // correctly surfaces it as impacting "homepage" — the same gating a real mission's
    // promotion (e.g. SOS-PUBLICATION-DECISION-M1-V1) goes through.
    expect(Object.keys(after.candidateFiles)).not.toContain(`${FIXTURE_ENTITY_ID}.json`);
    expect(after.bundle.candidateEntities).toEqual([]);
    expect(after.bundle.impactRecords).toHaveLength(1);
    expect(after.bundle.impactRecords[0]?.entities).toEqual([FIXTURE_ENTITY_ID]);
    expect(after.bundle.impactedSurfaces).toEqual(["homepage"]);

    // The two states are genuinely different bundles — this is a real diff, not a no-op.
    expect(after.serializedBundle).not.toBe(before.serializedBundle);
  });

  it("this fixture's synthetic entity/content never leaks into any real, rendered app surface", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const appDir = join(repoRoot, "src", "app");

    for (const file of listFilesRecursive(appDir)) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must never reference the CTC-V2 fixture`).not.toContain(FIXTURE_ENTITY_ID);
    }

    // Also confirm it never landed in the real, live content directories.
    const bundleJson = readFileSync(join(repoRoot, "content-bundles", "bundle.json"), "utf8");
    expect(bundleJson).not.toContain(FIXTURE_ENTITY_ID);

    const candidatesDir = join(repoRoot, "content", "candidates");
    for (const file of listFilesRecursive(candidatesDir)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain(FIXTURE_ENTITY_ID);
    }
  });
});
