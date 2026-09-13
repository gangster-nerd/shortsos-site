/**
 * Types for the ShortsOS capability manifest artifact, as actually emitted by the product
 * repository's `npm run public-truth:build` (see `scripts/build-public-product-manifest.ts`
 * in `shortsos`, and `src/public-truth/schema.ts` for the entity model it derives from).
 *
 * IMPORTANT — this deliberately does NOT mirror the product repo's in-memory
 * `PublicTruthEntity` type field-for-field. The product repo's schema.ts declares a single
 * `publicationStatus` field on an entity, but the *manifest JSON it actually writes* splits
 * that into two: `declaredPublicationStatus` (the human-asserted value on the entity before
 * policy is applied) and `derivedPublicationStatus` (the fail-closed output of
 * `derivePublicationCeiling`). This site consumes the JSON artifact, not the TypeScript
 * source, so these types match the artifact's real shape, confirmed by running the builder
 * against the product repo and inspecting its output byte-for-byte. Anyone importing a new
 * manifest and finding a field-name mismatch against `schema.ts` should trust this file and
 * the artifact, not the source-level type, unless the product repo changes its own writer.
 */

export const KNOWN_SCHEMA_VERSION = 3 as const;
export const KNOWN_STATUS_VOCABULARY_VERSION = 4 as const;

export const IMPLEMENTATION_STATUSES = ["implemented", "partial", "not_implemented"] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const RUNTIME_PROOFS = ["real_run_proven", "tested_only", "demo_only", "none"] as const;
export type RuntimeProof = (typeof RUNTIME_PROOFS)[number];

export const AVAILABILITIES = ["public", "operator_only", "test_accounts_only"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const PUBLICATION_STATUSES = ["public_marketable", "candidate", "internal_only", "blocked"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const SURFACES = [
  "homepage",
  "how_it_works",
  "methodology",
  "proof",
  "faq",
  "changelog",
  "glossary",
  "developer_note",
  "cta",
  "llms_txt",
  "schema_org",
] as const;
export type Surface = (typeof SURFACES)[number];

export const ENTITY_KINDS = ["capability", "prohibited_concept"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const EXTERNAL_DEPENDENCY_STATES = ["granted", "unknown", "denied"] as const;
export type ExternalDependencyState = (typeof EXTERNAL_DEPENDENCY_STATES)[number];

export interface ManifestExternalDependency {
  name: string;
  state: ExternalDependencyState;
  note: string;
}

export interface ManifestEvidenceBundle {
  id: string;
  commits: string[];
  paths: string[];
  tests: string[];
  decisions: string[];
  receipts: string[];
  /** Whether the product repo's verify-evidence.ts resolved this bundle at build time. */
  resolved: boolean;
}

export interface ManifestEntity {
  id: string;
  kind: EntityKind;
  implementationStatus: ImplementationStatus;
  runtimeProof: RuntimeProof;
  availability: Availability;
  declaredPublicationStatus: PublicationStatus;
  derivedPublicationStatus: PublicationStatus;
  allowedSurfaces: Surface[];
  externalDependencies: ManifestExternalDependency[];
  evidence: ManifestEvidenceBundle[];
  claimCeiling: string;
  prohibitedClaims: string[];
  knownLimits: string[];
  publicationDecision: string | null;
}

export interface ManifestCounts {
  public_marketable: number;
  candidate: number;
  internal_only: number;
  blocked: number;
}

export interface CapabilityManifest {
  schemaVersion: number;
  statusVocabularyVersion: number;
  entityCount: number;
  counts: ManifestCounts;
  entities: ManifestEntity[];
}
