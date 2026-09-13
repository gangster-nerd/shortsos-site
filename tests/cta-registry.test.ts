import { describe, expect, it } from "vitest";

import { CTA_REGISTRY, findUnjustifiedActiveCtas, isCtaActivatable } from "../src/lib/registries/cta-registry";
import type { CapabilityManifest } from "../src/lib/manifest/schema";

const emptyManifest: CapabilityManifest = {
  schemaVersion: 3,
  statusVocabularyVersion: 4,
  entityCount: 0,
  counts: { public_marketable: 0, candidate: 0, internal_only: 0, blocked: 0 },
  entities: [],
};

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
});
