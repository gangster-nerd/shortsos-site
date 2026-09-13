/**
 * Pure orchestration of one content:sync/content:verify pass. No filesystem, no process, no
 * `Date.now()` — takes raw file contents as strings and returns the exact bytes to write.
 * This is what makes idempotency ("same inputs twice -> byte-identical output") and
 * tamper-detection ("mutate an input -> throws") directly unit-testable without a real
 * product-repo checkout: `scripts/content-sync.ts` and `scripts/content-verify.ts` are thin
 * CLI wrappers around this function that differ only in where the inputs come from.
 */
import { buildContentBundle, serializeContentBundle } from "./build-bundle";
import type { ChangeImpactRecordRef, ContentBundle } from "./schema";
import { toImpactRecordRef } from "./impact-records";
import { verifyManifestArtifact } from "./manifest-artifact";

export interface RawImpactRecordFile {
  /** File path or other label, used only for error messages. */
  label: string;
  raw: string;
}

export interface SyncEngineInputs {
  productRef: string;
  manifestRaw: string;
  manifestSidecarRaw: string;
  manifestFileName: string;
  impactRecordFiles: RawImpactRecordFile[];
}

export interface SyncEngineOutput {
  bundle: ContentBundle;
  manifestChecksum: string;
  /** Exact bytes for `content-bundles/bundle.json`. */
  serializedBundle: string;
  /** Exact bytes for `content/candidates/<id>.json`, keyed by that relative filename. */
  candidateFiles: Record<string, string>;
}

function serializeCandidate(candidate: ContentBundle["candidateEntities"][number]): string {
  return `${JSON.stringify(candidate, null, 2)}\n`;
}

export function runSyncEngine(inputs: SyncEngineInputs): SyncEngineOutput {
  const { manifest, checksum } = verifyManifestArtifact({
    manifestRaw: inputs.manifestRaw,
    sidecarRaw: inputs.manifestSidecarRaw,
    manifestFileName: inputs.manifestFileName,
  });

  const impactRecords: ChangeImpactRecordRef[] = inputs.impactRecordFiles
    .map((f) => toImpactRecordRef(JSON.parse(f.raw), f.label))
    // Sort by source label first so parse order never affects anything observable before
    // buildContentBundle applies its own changeId sort — belt and suspenders determinism.
    .sort((a, b) => (a.changeId < b.changeId ? -1 : a.changeId > b.changeId ? 1 : 0));

  const bundle = buildContentBundle({
    productRef: inputs.productRef,
    manifest,
    manifestChecksum: checksum,
    impactRecords,
  });

  const serializedBundle = serializeContentBundle(bundle);

  const candidateFiles: Record<string, string> = {};
  for (const candidate of bundle.candidateEntities) {
    candidateFiles[`${candidate.id}.json`] = serializeCandidate(candidate);
  }

  return { bundle, manifestChecksum: checksum, serializedBundle, candidateFiles };
}
