import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { runSyncEngine, type RawImpactRecordFile } from "../src/lib/commit-to-content/sync-engine";
import { ManifestArtifactError } from "../src/lib/commit-to-content/manifest-artifact";

function makeManifestRaw(overrides: Partial<Record<string, unknown>> = {}): string {
  const manifest = {
    schemaVersion: 3,
    statusVocabularyVersion: 4,
    entityCount: 1,
    counts: { public_marketable: 0, candidate: 1, internal_only: 0, blocked: 0 },
    entities: [
      {
        id: "SOME-CAPABILITY-V1",
        kind: "capability",
        implementationStatus: "implemented",
        runtimeProof: "real_run_proven",
        availability: "operator_only",
        declaredPublicationStatus: "candidate",
        derivedPublicationStatus: "candidate",
        allowedSurfaces: ["homepage"],
        externalDependencies: [],
        evidence: [],
        claimCeiling: "Some real claim.",
        prohibitedClaims: [],
        knownLimits: [],
        publicationDecision: null,
      },
    ],
    ...overrides,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function sha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function makeSidecarRaw(manifestRaw: string, fileName: string): string {
  return `${sha256(manifestRaw)}  ${fileName}\n`;
}

const FILE_NAME = "public-product-manifest.json";

const impactRecordFiles: RawImpactRecordFile[] = [
  {
    label: "example-change.json",
    raw: JSON.stringify({
      changeId: "example-change",
      baseRef: "aaaa",
      headRef: "bbbb",
      entities: ["SOME-CAPABILITY-V1"],
      qualification: "public_content_impact",
      surfacesImpacted: ["homepage"],
    }),
  },
];

describe("runSyncEngine", () => {
  it("is idempotent: identical inputs produce byte-identical bundle and candidate files", () => {
    const manifestRaw = makeManifestRaw();
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);

    const inputs = {
      productRef: "deadbeef",
      manifestRaw,
      manifestSidecarRaw: sidecarRaw,
      manifestFileName: FILE_NAME,
      impactRecordFiles,
    };

    const first = runSyncEngine(inputs);
    const second = runSyncEngine(inputs);

    expect(second.serializedBundle).toBe(first.serializedBundle);
    expect(second.candidateFiles).toEqual(first.candidateFiles);
    expect(second.manifestChecksum).toBe(first.manifestChecksum);
  });

  it("produces the same bundle for the same product ref even called at two different times", () => {
    // No Date.now()/wall-clock anywhere in the pure engine — asserting this explicitly since
    // it's the property the "no previous snapshot" / re-sync flow depends on.
    const manifestRaw = makeManifestRaw();
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);
    const inputs = {
      productRef: "cafef00d",
      manifestRaw,
      manifestSidecarRaw: sidecarRaw,
      manifestFileName: FILE_NAME,
      impactRecordFiles: [],
    };
    const a = runSyncEngine(inputs);
    const b = runSyncEngine({ ...inputs });
    expect(a.serializedBundle).toBe(b.serializedBundle);
  });

  it("throws on a tampered pinned manifest (edited without regenerating the checksum)", () => {
    const manifestRaw = makeManifestRaw();
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);
    const tamperedManifestRaw = manifestRaw.replace("Some real claim.", "A tampered, unreviewed claim.");

    expect(() =>
      runSyncEngine({
        productRef: "deadbeef",
        manifestRaw: tamperedManifestRaw,
        manifestSidecarRaw: sidecarRaw,
        manifestFileName: FILE_NAME,
        impactRecordFiles: [],
      }),
    ).toThrow(ManifestArtifactError);
  });

  it("throws on an unknown schemaVersion", () => {
    const manifestRaw = makeManifestRaw({ schemaVersion: 999 });
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);
    expect(() =>
      runSyncEngine({
        productRef: "deadbeef",
        manifestRaw,
        manifestSidecarRaw: sidecarRaw,
        manifestFileName: FILE_NAME,
        impactRecordFiles: [],
      }),
    ).toThrow(/schemaVersion/);
  });

  it("throws on a malformed impact record", () => {
    const manifestRaw = makeManifestRaw();
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);
    expect(() =>
      runSyncEngine({
        productRef: "deadbeef",
        manifestRaw,
        manifestSidecarRaw: sidecarRaw,
        manifestFileName: FILE_NAME,
        impactRecordFiles: [{ label: "broken.json", raw: JSON.stringify({ changeId: "x" }) }],
      }),
    ).toThrow(/baseRef/);
  });

  it("includes only candidate-status entities in candidateFiles, keyed by <id>.json", () => {
    const manifestRaw = makeManifestRaw();
    const sidecarRaw = makeSidecarRaw(manifestRaw, FILE_NAME);
    const output = runSyncEngine({
      productRef: "deadbeef",
      manifestRaw,
      manifestSidecarRaw: sidecarRaw,
      manifestFileName: FILE_NAME,
      impactRecordFiles: [],
    });
    expect(Object.keys(output.candidateFiles)).toEqual(["SOME-CAPABILITY-V1.json"]);
  });
});
