/**
 * Strict manifest loader.
 *
 * Loads `capability-manifest.json` + its `.sha256` sidecar + `IMPORT.md` provenance record
 * from a directory (default: `product-manifest/` at the repo root). Fails CLOSED and LOUD:
 *
 *  - unknown schemaVersion / statusVocabularyVersion -> throws, never silently coerces
 *  - checksum mismatch -> throws, never silently loads anyway
 *  - missing IMPORT.md -> throws (a manifest with no recorded provenance is not trusted)
 *
 * This loader has no knowledge of "placeholder vs real" — that distinction lives in
 * IMPORT.md's prose, read by a human, not encoded as a boolean the loader could get wrong.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  KNOWN_SCHEMA_VERSION,
  KNOWN_STATUS_VOCABULARY_VERSION,
  type CapabilityManifest,
} from "./schema";

export class ManifestLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestLoadError";
  }
}

export interface LoadedManifest {
  manifest: CapabilityManifest;
  checksum: string;
  manifestPath: string;
  checksumPath: string;
  importDocPath: string;
}

export interface LoadManifestOptions {
  /** Directory containing capability-manifest.json, its .sha256, and IMPORT.md. */
  dir?: string;
  manifestFileName?: string;
}

const DEFAULT_DIR = join(process.cwd(), "product-manifest");
const DEFAULT_MANIFEST_FILE = "capability-manifest.json";

/** Parses a coreutils-style `<hex>  <filename>` sha256sum line. Throws if malformed. */
export function parseSha256SidecarLine(raw: string, expectedFileName: string): string {
  const trimmed = raw.trim();
  const match = /^([0-9a-f]{64})\s+(?:\*)?(.+)$/i.exec(trimmed);
  if (!match) {
    throw new ManifestLoadError(
      `Malformed .sha256 sidecar: expected "<64-hex-digest>  <filename>", got: ${JSON.stringify(raw)}`,
    );
  }
  const digest = match[1];
  const fileName = match[2];
  if (digest === undefined || fileName === undefined) {
    throw new ManifestLoadError(
      `Malformed .sha256 sidecar: expected "<64-hex-digest>  <filename>", got: ${JSON.stringify(raw)}`,
    );
  }
  if (fileName !== expectedFileName) {
    throw new ManifestLoadError(
      `.sha256 sidecar names a different file (${JSON.stringify(fileName)}) than expected (${JSON.stringify(expectedFileName)}). Refusing to load: the checksum and the manifest may have been imported inconsistently.`,
    );
  }
  return digest.toLowerCase();
}

export function loadCapabilityManifest(options: LoadManifestOptions = {}): LoadedManifest {
  const dir = options.dir ?? DEFAULT_DIR;
  const manifestFileName = options.manifestFileName ?? DEFAULT_MANIFEST_FILE;

  const manifestPath = join(dir, manifestFileName);
  const checksumPath = `${manifestPath}.sha256`;
  const importDocPath = join(dir, "IMPORT.md");

  if (!existsSync(manifestPath)) {
    throw new ManifestLoadError(`No manifest at ${manifestPath}. Refusing to render without a pinned artifact.`);
  }
  if (!existsSync(checksumPath)) {
    throw new ManifestLoadError(`No checksum sidecar at ${checksumPath}. Refusing to load an unverifiable manifest.`);
  }
  if (!existsSync(importDocPath)) {
    throw new ManifestLoadError(
      `No IMPORT.md provenance record at ${importDocPath}. Refusing to load a manifest with no recorded provenance.`,
    );
  }

  const raw = readFileSync(manifestPath, "utf8");
  const expectedDigest = parseSha256SidecarLine(readFileSync(checksumPath, "utf8"), manifestFileName);
  const actualDigest = createHash("sha256").update(raw, "utf8").digest("hex");

  if (actualDigest !== expectedDigest) {
    throw new ManifestLoadError(
      `Checksum mismatch for ${manifestPath}: sidecar says ${expectedDigest}, computed ${actualDigest}. ` +
        `The manifest may have been edited without regenerating its checksum, or corrupted in transit. Refusing to load.`,
    );
  }

  let manifest: CapabilityManifest;
  try {
    manifest = JSON.parse(raw) as CapabilityManifest;
  } catch (err) {
    throw new ManifestLoadError(`Manifest at ${manifestPath} is not valid JSON: ${(err as Error).message}`);
  }

  if (manifest.schemaVersion !== KNOWN_SCHEMA_VERSION) {
    throw new ManifestLoadError(
      `Unknown manifest schemaVersion ${manifest.schemaVersion}. This loader only recognizes ` +
        `schemaVersion ${KNOWN_SCHEMA_VERSION}. Refusing to load: a schema change must be reviewed and the ` +
        `loader's known-versions updated deliberately, never silently accepted.`,
    );
  }
  if (manifest.statusVocabularyVersion !== KNOWN_STATUS_VOCABULARY_VERSION) {
    throw new ManifestLoadError(
      `Unknown statusVocabularyVersion ${manifest.statusVocabularyVersion}. This loader only recognizes ` +
        `statusVocabularyVersion ${KNOWN_STATUS_VOCABULARY_VERSION}. Refusing to load.`,
    );
  }

  if (!Array.isArray(manifest.entities)) {
    throw new ManifestLoadError(`Manifest at ${manifestPath} has no "entities" array. Refusing to load.`);
  }
  if (manifest.entityCount !== manifest.entities.length) {
    throw new ManifestLoadError(
      `Manifest entityCount (${manifest.entityCount}) does not match entities.length (${manifest.entities.length}). Refusing to load a self-inconsistent manifest.`,
    );
  }

  return { manifest, checksum: actualDigest, manifestPath, checksumPath, importDocPath };
}
