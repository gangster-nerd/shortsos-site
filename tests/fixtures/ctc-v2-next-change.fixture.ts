/**
 * SOS-CTC-V2 PROOF FIXTURE — synthetic, deterministic test data only.
 *
 * Purpose: as of this mission, `origin/main` in the product repo (`shortsos`) was fetched
 * and found to be at the exact same SHA already pinned in `content-bundles/pin.json`
 * (f01ac6110ec664aba31ee985a4c30d307de10b2f) — i.e. no real new governed change exists yet
 * to sync against. Rather than fabricate a fake product change and pass it off as real
 * history, this fixture exercises the SAME pure `runSyncEngine` library function the real
 * `content:sync` CLI calls, with an entirely synthetic "next governed change" manifest, to
 * prove the mechanism (idempotent re-sync, correct diffing, correct candidate-surface
 * gating) generalizes to a change that hasn't happened yet, without any redesign.
 *
 * Hard rules this fixture obeys:
 *  - Every id below is prefixed `FIXTURE-` and does not collide with any real manifest
 *    entity id — see CAPABILITIES.yaml / content-bundles/inputs/manifest.json for the real
 *    ids, none of which use this prefix.
 *  - This file is never imported by anything under `src/app/**`.
 *  - Nothing produced from this fixture is ever written to `content-bundles/**` or
 *    `content/candidates/**` (the real, live content directories) — `tests/ctc-v2-next-
 *    change-proof.test.ts` asserts this by feeding it directly to the pure engine function
 *    in memory and never touching `scripts/content-sync.ts` or the filesystem writers it
 *    calls.
 */
import { createHash } from "node:crypto";

import type { RawImpactRecordFile, SyncEngineInputs } from "../../src/lib/commit-to-content/sync-engine";

export const FIXTURE_ENTITY_ID = "FIXTURE-NEXT-CHANGE-CAPABILITY-V1";
export const FIXTURE_MANIFEST_FILE_NAME = "public-product-manifest.json";

function sha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function sidecarFor(manifestRaw: string): string {
  return `${sha256(manifestRaw)}  ${FIXTURE_MANIFEST_FILE_NAME}\n`;
}

function baseEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_ENTITY_ID,
    kind: "capability",
    implementationStatus: "implemented",
    runtimeProof: "tested_only",
    availability: "operator_only",
    declaredPublicationStatus: "candidate",
    derivedPublicationStatus: "candidate",
    allowedSurfaces: [] as string[],
    externalDependencies: [],
    evidence: [],
    claimCeiling: "Fixture-only claim ceiling; never rendered on any real page.",
    prohibitedClaims: ["Fixture-only prohibited claim."],
    knownLimits: ["This entity does not exist in the real manifest."],
    publicationDecision: null,
    ...overrides,
  };
}

function manifestRawFor(entity: ReturnType<typeof baseEntity>): string {
  const manifest = {
    schemaVersion: 3,
    statusVocabularyVersion: 4,
    entityCount: 1,
    counts: {
      public_marketable: entity.derivedPublicationStatus === "public_marketable" ? 1 : 0,
      candidate: entity.derivedPublicationStatus === "candidate" ? 1 : 0,
      internal_only: entity.derivedPublicationStatus === "internal_only" ? 1 : 0,
      blocked: entity.derivedPublicationStatus === "blocked" ? 1 : 0,
    },
    entities: [entity],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * "Before": the synthetic capability is still a candidate — the state a real capability
 * sits in prior to a governance mission ratifying it for a public claim.
 */
export function buildFixtureBeforeInputs(): SyncEngineInputs {
  const entity = baseEntity();
  const manifestRaw = manifestRawFor(entity);
  return {
    productRef: "fixture-before-sha",
    manifestRaw,
    manifestSidecarRaw: sidecarFor(manifestRaw),
    manifestFileName: FIXTURE_MANIFEST_FILE_NAME,
    impactRecordFiles: [],
  };
}

/**
 * "After": simulates the next governed change — a mission promotes the synthetic
 * capability to `public_marketable` and allows it on the homepage, and files a real-shaped
 * change-impact record for that promotion. This is the shape a real next mission's diff
 * would take (compare to SOS-PUBLICATION-DECISION-M1-V1's real promotion of
 * M1-REAL-PRODUCE-REVIEW-PUBLISH in the product repo).
 */
export function buildFixtureAfterInputs(): SyncEngineInputs {
  const entity = baseEntity({
    declaredPublicationStatus: "public_marketable",
    derivedPublicationStatus: "public_marketable",
    allowedSurfaces: ["homepage"],
    publicationDecision: "docs/governance/publication/FIXTURE-does-not-exist.md",
  });
  const manifestRaw = manifestRawFor(entity);

  const impactRecordFiles: RawImpactRecordFile[] = [
    {
      label: "fixture-next-change.json",
      raw: JSON.stringify({
        changeId: "fixture-next-change",
        baseRef: "fixture-before-sha",
        headRef: "fixture-after-sha",
        entities: [FIXTURE_ENTITY_ID],
        qualification: "public_content_impact",
        surfacesImpacted: ["homepage"],
      }),
    },
  ];

  return {
    productRef: "fixture-after-sha",
    manifestRaw,
    manifestSidecarRaw: sidecarFor(manifestRaw),
    manifestFileName: FIXTURE_MANIFEST_FILE_NAME,
    impactRecordFiles,
  };
}
