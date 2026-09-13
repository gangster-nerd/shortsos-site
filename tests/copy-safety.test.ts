import { describe, expect, it } from "vitest";

import { checkCopySafety, type CopySource } from "../src/lib/safety/copy-safety";
import { SITE_COPY_SOURCES } from "../src/content/copy-sources";
import { loadCapabilityManifest } from "../src/lib/manifest/loader";
import type { CapabilityManifest } from "../src/lib/manifest/schema";

const manifest: CapabilityManifest = {
  schemaVersion: 3,
  statusVocabularyVersion: 4,
  entityCount: 1,
  counts: { public_marketable: 0, candidate: 0, internal_only: 1, blocked: 0 },
  entities: [
    {
      id: "OPERATOR-ONLY-CAP",
      kind: "capability",
      implementationStatus: "implemented",
      runtimeProof: "tested_only",
      availability: "operator_only",
      declaredPublicationStatus: "internal_only",
      derivedPublicationStatus: "internal_only",
      allowedSurfaces: [],
      externalDependencies: [],
      evidence: [],
      claimCeiling: "Operator-run only.",
      prohibitedClaims: [],
      knownLimits: [],
      publicationDecision: null,
    },
  ],
};

describe("checkCopySafety", () => {
  it("catches a planted forbidden self-serve phrase for an operator_only capability", () => {
    const sources: CopySource[] = [
      {
        id: "planted-violation",
        text: "Connect your Drive and self-serve your way to publishing.",
        relatedEntityIds: ["OPERATOR-ONLY-CAP"],
      },
    ];
    const violations = checkCopySafety(sources, manifest);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.phrase === "connect your drive")).toBe(true);
  });

  it("does not flag the same phrase for an entity that is not operator_only", () => {
    const publicManifest: CapabilityManifest = {
      ...manifest,
      entities: [{ ...manifest.entities[0]!, availability: "public", derivedPublicationStatus: "public_marketable" }],
    };
    const sources: CopySource[] = [
      {
        id: "legit-self-serve",
        text: "Self-serve today, no operator required.",
        relatedEntityIds: ["OPERATOR-ONLY-CAP"],
      },
    ];
    const violations = checkCopySafety(sources, publicManifest);
    expect(violations.length).toBe(0);
  });

  it("passes clean site copy against the real placeholder manifest", () => {
    const { manifest: placeholderManifest } = loadCapabilityManifest();
    const violations = checkCopySafety(SITE_COPY_SOURCES, placeholderManifest);
    expect(violations).toEqual([]);
  });
});
