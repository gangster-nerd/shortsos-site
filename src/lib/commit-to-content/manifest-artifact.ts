/**
 * Verifies a raw product-manifest artifact (as read directly off disk from the product
 * repo's `.artifacts/public-product-manifest.json` + its `.sha256` sidecar) before any of
 * this repo's tooling is allowed to build a content bundle from it.
 *
 * Deliberately separate from `../manifest/loader.ts`: that loader is for THIS site's own
 * committed `product-manifest/` directory and additionally requires an `IMPORT.md`
 * provenance record (a site-import concept). This module verifies the artifact exactly as
 * the product repo emits it — no IMPORT.md, no fixed directory — so it can be reused both
 * against a live product-repo checkout (content-sync) and against a pinned, committed copy
 * of that same artifact (content-verify), which is exactly what the sync/verify split needs.
 */
import { createHash } from "node:crypto";

import { parseSha256SidecarLine } from "../manifest/loader";
import {
  KNOWN_SCHEMA_VERSION,
  KNOWN_STATUS_VOCABULARY_VERSION,
  type CapabilityManifest,
} from "../manifest/schema";

export class ManifestArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestArtifactError";
  }
}

export interface VerifiedManifestArtifact {
  manifest: CapabilityManifest;
  checksum: string;
}

export function verifyManifestArtifact(params: {
  manifestRaw: string;
  sidecarRaw: string;
  manifestFileName: string;
}): VerifiedManifestArtifact {
  const { manifestRaw, sidecarRaw, manifestFileName } = params;

  const expectedDigest = parseSha256SidecarLine(sidecarRaw, manifestFileName);
  const actualDigest = createHash("sha256").update(manifestRaw, "utf8").digest("hex");

  if (actualDigest !== expectedDigest) {
    throw new ManifestArtifactError(
      `Checksum mismatch for ${manifestFileName}: sidecar says ${expectedDigest}, computed ${actualDigest}. ` +
        `The manifest may have been edited without regenerating its checksum, or corrupted in transit. Refusing to use it.`,
    );
  }

  let manifest: CapabilityManifest;
  try {
    manifest = JSON.parse(manifestRaw) as CapabilityManifest;
  } catch (err) {
    throw new ManifestArtifactError(`${manifestFileName} is not valid JSON: ${(err as Error).message}`);
  }

  if (manifest.schemaVersion !== KNOWN_SCHEMA_VERSION) {
    throw new ManifestArtifactError(
      `Unknown manifest schemaVersion ${manifest.schemaVersion}. This tooling only recognizes ` +
        `schemaVersion ${KNOWN_SCHEMA_VERSION}. Refusing to build a content bundle from it.`,
    );
  }
  if (manifest.statusVocabularyVersion !== KNOWN_STATUS_VOCABULARY_VERSION) {
    throw new ManifestArtifactError(
      `Unknown statusVocabularyVersion ${manifest.statusVocabularyVersion}. This tooling only recognizes ` +
        `statusVocabularyVersion ${KNOWN_STATUS_VOCABULARY_VERSION}. Refusing to build a content bundle from it.`,
    );
  }
  if (!Array.isArray(manifest.entities)) {
    throw new ManifestArtifactError(`${manifestFileName} has no "entities" array. Refusing to use it.`);
  }
  if (manifest.entityCount !== manifest.entities.length) {
    throw new ManifestArtifactError(
      `Manifest entityCount (${manifest.entityCount}) does not match entities.length (${manifest.entities.length}). Refusing to use a self-inconsistent manifest.`,
    );
  }

  return { manifest, checksum: actualDigest };
}
