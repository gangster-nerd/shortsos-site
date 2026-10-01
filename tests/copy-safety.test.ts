import { describe, expect, it } from "vitest";

import { checkCopySafety, findForbiddenSelfServePhrases, type CopySource } from "../src/lib/safety/copy-safety";
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

  it("catches self-service, which the self-serve phrase does not contain", () => {
    const violations = checkCopySafety([{ id: "en", text: "A self\u2011service studio.", relatedEntityIds: ["OPERATOR-ONLY-CAP"] }], manifest);
    expect(violations.map((v) => v.phrase)).toEqual(["self-service"]);
  });
});

describe("checkCopySafety in French", () => {
  const french = (text: string): CopySource[] => [{ id: "fr-copy", text, relatedEntityIds: ["OPERATOR-ONLY-CAP"] }];

  it("catches French self-serve wording whatever the accents, case, apostrophes and spaces", () => {
    const text = "Présentation\nCréez votre compte et connectez votre Drive en toute autonomie.\nInscrivez\u2011vous\u00a0!";
    const violations = checkCopySafety(french(text), manifest);
    expect(violations.map((v) => v.phrase).sort()).toEqual(
      ["connectez votre drive", "créez votre compte", "en toute autonomie", "inscrivez-vous"].sort(),
    );
    const accountHit = violations.find((v) => v.phrase === "créez votre compte")!;
    expect(accountHit.context).toBe("Créez votre compte et connectez votre Drive en toute autonomie.");
    expect(violations.find((v) => v.phrase === "inscrivez-vous")!.context).toBe("Inscrivez\u2011vous\u00a0!");
  });

  it("matches without accents too", () => {
    expect(findForbiddenSelfServePhrases("creez votre compte, demarrez gratuitement").map((h) => h.phrase)).toEqual([
      "créez votre compte",
      "démarrez gratuitement",
    ]);
  });

  it("lets an honest French answer through", () => {
    const text =
      "Il n'y a pas d'inscription : un pilote commence par une conversation directe avec l'équipe ShortsOS, " +
      "qui opère la production pour le client.";
    expect(checkCopySafety(french(text), manifest)).toEqual([]);
  });
});

