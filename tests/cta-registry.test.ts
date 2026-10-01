import { describe, expect, it } from "vitest";

import { CTA_REGISTRY, findUnjustifiedActiveCtas, isCtaActivatable, type CtaDefinition } from "../src/lib/registries/cta-registry";
import { loadSiteManifest } from "../src/lib/manifest/site-manifest";
import type { CapabilityManifest, ManifestEntity } from "../src/lib/manifest/schema";

const emptyManifest: CapabilityManifest = {
  schemaVersion: 3,
  statusVocabularyVersion: 4,
  entityCount: 0,
  counts: { public_marketable: 0, candidate: 0, internal_only: 0, blocked: 0 },
  entities: [],
};

/** A manifest holding one entity for the self-serve onboarding CTA, fully qualified unless overridden. */
function manifestWithOnboarding(overrides: Partial<ManifestEntity>): CapabilityManifest {
  const entity: ManifestEntity = {
    id: "SELF-SERVE-ONBOARDING-V1",
    kind: "capability",
    implementationStatus: "implemented",
    runtimeProof: "real_run_proven",
    availability: "public",
    declaredPublicationStatus: "public_marketable",
    derivedPublicationStatus: "public_marketable",
    allowedSurfaces: ["cta", "homepage"],
    externalDependencies: [],
    evidence: [],
    claimCeiling: "Fixture only.",
    prohibitedClaims: [],
    knownLimits: [],
    publicationDecision: "fixture",
    ...overrides,
  };
  return { ...emptyManifest, entityCount: 1, entities: [entity] };
}

const gatedCtas = (Object.values(CTA_REGISTRY) as CtaDefinition[]).filter((cta) => cta.requiredManifestSignal !== null);

describe("CTA registry", () => {
  it("has exactly one enabled CTA in V1: request_pilot", () => {
    const enabled = Object.values(CTA_REGISTRY).filter((c) => c.enabled);
    expect(enabled.map((c) => c.id)).toEqual(["request_pilot"]);
  });

  it("declares connect_your_drive, publish_to_instagram, start_self_serve as present but disabled", () => {
    expect(CTA_REGISTRY.connect_your_drive.enabled).toBe(false);
    expect(CTA_REGISTRY.publish_to_instagram.enabled).toBe(false);
    expect(CTA_REGISTRY.start_self_serve.enabled).toBe(false);
  });

  it("request_pilot is always activatable (no manifest gate)", () => {
    expect(isCtaActivatable(CTA_REGISTRY.request_pilot, emptyManifest)).toBe(true);
  });

  it("a gated CTA is not activatable against an empty manifest", () => {
    expect(isCtaActivatable(CTA_REGISTRY.connect_your_drive, emptyManifest)).toBe(false);
  });

  it("findUnjustifiedActiveCtas is empty for the real registry against an empty manifest", () => {
    // Only request_pilot is enabled, and it has no gate, so nothing should be flagged.
    expect(findUnjustifiedActiveCtas(emptyManifest)).toEqual([]);
  });

  it("would flag a disabled CTA if it were force-enabled without manifest backing", () => {
    const tamperedRegistry = {
      ...CTA_REGISTRY,
      connect_your_drive: { ...CTA_REGISTRY.connect_your_drive, enabled: true },
    };
    const violators = (Object.values(tamperedRegistry) as (typeof CTA_REGISTRY)[keyof typeof CTA_REGISTRY][])
      .filter((cta) => cta.enabled && !isCtaActivatable(cta, emptyManifest))
      .map((cta) => cta.id);
    expect(violators).toContain("connect_your_drive");
  });

  it("every gated CTA is a self-serve CTA and requires a public_marketable, generally available entity", () => {
    // The product's own list (SELF_SERVE_CTAS in src/public-truth/publication-policy.ts).
    expect(gatedCtas.map((c) => c.id).sort()).toEqual(["connect_your_drive", "publish_to_instagram", "start_self_serve"]);
    for (const cta of gatedCtas) {
      expect(cta.requiredManifestSignal).toMatchObject({
        requiredDerivedPublicationStatus: "public_marketable",
        requiredAvailability: "public",
      });
    }
  });

  it("a gated CTA is activatable only when every condition holds", () => {
    const cta = CTA_REGISTRY.start_self_serve;
    expect(isCtaActivatable(cta, manifestWithOnboarding({}))).toBe(true);
  });

  it("an operator_only entity never opens a self-serve CTA, even when public_marketable (the M1 case)", () => {
    const cta = CTA_REGISTRY.start_self_serve;
    expect(isCtaActivatable(cta, manifestWithOnboarding({ availability: "operator_only" }))).toBe(false);
    expect(isCtaActivatable(cta, manifestWithOnboarding({ availability: "test_accounts_only" }))).toBe(false);
  });

  it("a gated CTA stays closed when the entity is not public_marketable, not allowed on the cta surface, or a prohibited concept", () => {
    const cta = CTA_REGISTRY.start_self_serve;
    expect(isCtaActivatable(cta, manifestWithOnboarding({ derivedPublicationStatus: "candidate" }))).toBe(false);
    expect(isCtaActivatable(cta, manifestWithOnboarding({ allowedSurfaces: ["homepage"] }))).toBe(false);
    expect(isCtaActivatable(cta, manifestWithOnboarding({ kind: "prohibited_concept" }))).toBe(false);
  });

  it("no gated CTA is activatable against the real synced manifest", () => {
    const { manifest } = loadSiteManifest();
    for (const cta of gatedCtas) {
      expect(isCtaActivatable(cta, manifest)).toBe(false);
    }
  });
});
