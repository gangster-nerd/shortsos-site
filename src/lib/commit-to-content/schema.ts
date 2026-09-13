/**
 * ShortsOS's own Commit-to-Content bundle schema (CTC_DECISION=BUILD_FRESH — shares zero
 * field-name overlap with textos-site's ContentBundle by design; do not compare the two
 * shapes as if convergence were expected).
 *
 * A ContentBundle is the deterministic output of one `content:sync` run against one pinned
 * product ref: which manifest digest it saw, which change-impact records it read, which
 * surfaces/candidate entities that implies. It carries NO wall-clock timestamp and NO
 * environment-dependent data — running sync twice against the same product ref and the same
 * product-repo tree must produce byte-identical JSON. Anything that legitimately varies run
 * to run (when the sync happened) lives in the separate `pin.json` status file, never here.
 */

export interface ChangeImpactRecordRef {
  changeId: string;
  baseRef: string;
  headRef: string;
  entities: string[];
  qualification: string;
  surfacesImpacted: string[];
}

export interface CandidateEntitySummary {
  id: string;
  kind: string;
  derivedPublicationStatus: string;
  claimCeiling: string;
  allowedSurfaces: string[];
}

export interface ContentBundle {
  /** Deterministically derived from productRef: `bundle-<productRef>`. */
  bundleId: string;
  productRef: string;
  manifestSchemaVersion: number;
  manifestStatusVocabularyVersion: number;
  manifestChecksum: string;
  manifestEntityCount: number;
  /** Change-impact records read from the product repo's changes/content-impact/records/**,
   *  sorted by changeId for determinism. Empty array (not omitted) if none were found —
   *  emptiness is itself meaningful and must be visible, not hidden by omitting the key. */
  impactRecords: ChangeImpactRecordRef[];
  /** Sorted, deduplicated union of allowedSurfaces for every entity referenced by an
   *  impact record's `entities` field. Empty if no impact record names any entity. */
  impactedSurfaces: string[];
  /** Every manifest entity currently at derivedPublicationStatus === "candidate", sorted by id. */
  candidateEntities: CandidateEntitySummary[];
  /** Honest disclosure of how this bundle's inputs were actually obtained, carried inside
   *  the deterministic artifact itself so a reader of the committed JSON sees the same
   *  limitation the docs describe, without having to cross-reference IMPORT.md. */
  sourceDisclosure: string;
}

export const SOURCE_DISCLOSURE =
  "Built by shelling out to `npm run public-truth:build` in a local checkout of the product " +
  "repository at the path given to content:sync, then reading its .artifacts output directly " +
  "off disk. No network call. No published/CI manifest artifact exists yet to fetch instead.";
