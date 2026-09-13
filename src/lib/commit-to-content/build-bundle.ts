/**
 * Pure, deterministic bundle construction. No filesystem, no process, no Date.now(). Given
 * the same manifest + impact records + productRef, always produces byte-identical output —
 * this is what the idempotency test exercises directly, without needing a real product-repo
 * checkout.
 */
import type { CapabilityManifest } from "../manifest/schema";
import { SOURCE_DISCLOSURE, type CandidateEntitySummary, type ChangeImpactRecordRef, type ContentBundle } from "./schema";

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function dedupeSorted(values: readonly string[]): string[] {
  return sortedStrings([...new Set(values)]);
}

export function buildContentBundle(input: {
  productRef: string;
  manifest: CapabilityManifest;
  manifestChecksum: string;
  impactRecords: ChangeImpactRecordRef[];
}): ContentBundle {
  const { productRef, manifest, manifestChecksum } = input;

  const impactRecords = [...input.impactRecords].sort((a, b) => (a.changeId < b.changeId ? -1 : a.changeId > b.changeId ? 1 : 0));

  const referencedEntityIds = dedupeSorted(impactRecords.flatMap((r) => r.entities));
  const impactedSurfaces = dedupeSorted(
    referencedEntityIds.flatMap((id) => manifest.entities.find((e) => e.id === id)?.allowedSurfaces ?? []),
  );

  const candidateEntities: CandidateEntitySummary[] = manifest.entities
    .filter((e) => e.derivedPublicationStatus === "candidate")
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      derivedPublicationStatus: e.derivedPublicationStatus,
      claimCeiling: e.claimCeiling,
      allowedSurfaces: sortedStrings(e.allowedSurfaces),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    bundleId: `bundle-${productRef}`,
    productRef,
    manifestSchemaVersion: manifest.schemaVersion,
    manifestStatusVocabularyVersion: manifest.statusVocabularyVersion,
    manifestChecksum,
    manifestEntityCount: manifest.entityCount,
    impactRecords,
    impactedSurfaces,
    candidateEntities,
    sourceDisclosure: SOURCE_DISCLOSURE,
  };
}

/** Deterministic serialization used everywhere a bundle is written or compared. */
export function serializeContentBundle(bundle: ContentBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
