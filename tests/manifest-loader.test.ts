import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadCapabilityManifest, ManifestLoadError } from "../src/lib/manifest/loader";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "manifest-loader-test-"));
}

function writeManifest(dir: string, manifestObj: unknown, opts: { badChecksum?: boolean; skipImport?: boolean } = {}) {
  const raw = JSON.stringify(manifestObj, null, 2);
  writeFileSync(join(dir, "capability-manifest.json"), raw, "utf8");
  const digest = opts.badChecksum
    ? "0".repeat(64)
    : createHash("sha256").update(raw, "utf8").digest("hex");
  writeFileSync(join(dir, "capability-manifest.json.sha256"), `${digest}  capability-manifest.json\n`, "utf8");
  if (!opts.skipImport) {
    writeFileSync(join(dir, "IMPORT.md"), "# test\n", "utf8");
  }
}

function validManifest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 3,
    statusVocabularyVersion: 4,
    entityCount: 0,
    counts: { public_marketable: 0, candidate: 0, internal_only: 0, blocked: 0 },
    entities: [],
    ...overrides,
  };
}

describe("loadCapabilityManifest", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("loads a well-formed, checksum-matching, known-version manifest", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest());
    const result = loadCapabilityManifest({ dir });
    expect(result.manifest.schemaVersion).toBe(3);
    expect(result.manifest.statusVocabularyVersion).toBe(4);
  });

  it("rejects an unknown schemaVersion", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest({ schemaVersion: 999 }));
    expect(() => loadCapabilityManifest({ dir })).toThrow(ManifestLoadError);
    expect(() => loadCapabilityManifest({ dir })).toThrow(/schemaVersion/);
  });

  it("rejects an unknown statusVocabularyVersion", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest({ statusVocabularyVersion: 999 }));
    expect(() => loadCapabilityManifest({ dir })).toThrow(/statusVocabularyVersion/);
  });

  it("rejects a checksum mismatch", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest(), { badChecksum: true });
    expect(() => loadCapabilityManifest({ dir })).toThrow(/Checksum mismatch/);
  });

  it("rejects a missing IMPORT.md", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest(), { skipImport: true });
    expect(() => loadCapabilityManifest({ dir })).toThrow(/IMPORT\.md/);
  });

  it("rejects entityCount/entities.length mismatch", () => {
    dir = makeTmpDir();
    writeManifest(dir, validManifest({ entityCount: 5 }));
    expect(() => loadCapabilityManifest({ dir })).toThrow(/entityCount/);
  });

  it("loads the repo's real seeded placeholder manifest", () => {
    const result = loadCapabilityManifest();
    expect(result.manifest.entities.length).toBeGreaterThan(0);
    expect(result.manifest.entities.every((e) => e.id.startsWith("EXAMPLE-PLACEHOLDER"))).toBe(true);
  });
});
