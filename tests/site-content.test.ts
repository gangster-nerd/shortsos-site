import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkCopySafety } from "../src/lib/safety/copy-safety";
import {
  SITE_COPY_SOURCES,
  FAQ_ITEMS,
  CHANGELOG_ENTRIES,
  GLOSSARY_ENTRIES,
  HOME_INTRO,
  HOW_IT_WORKS_INTRO,
  PROOF_INTRO,
  METHODOLOGY_INTRO,
} from "../src/content/copy-sources";
import { loadSiteManifest } from "../src/lib/manifest/site-manifest";
import { findUnjustifiedActiveCtas } from "../src/lib/registries/cta-registry";
import { getM1ForSurface, splitM1Claim, M1_ENTITY_ID } from "../src/lib/content/m1";
import { getEntity } from "../src/lib/registries/capability-registry";
import { PilotCta } from "../src/components/pilot-cta";

describe("real synced manifest", () => {
  it("loads, verifies, and has exactly the ratified counts", () => {
    const { manifest, productRef } = loadSiteManifest();
    expect(productRef).toBe("22e31cd6f7146813a31d90bbaa03b1ae554e5cd6");
    expect(manifest.counts).toEqual({
      public_marketable: 1,
      candidate: 8,
      internal_only: 30,
      blocked: 3,
    });
  });

  it("has no unjustified active CTAs against the real manifest", () => {
    const { manifest } = loadSiteManifest();
    expect(findUnjustifiedActiveCtas(manifest)).toEqual([]);
  });

  it("passes copy safety for every real page's copy against the real manifest", () => {
    const { manifest } = loadSiteManifest();
    const violations = checkCopySafety(SITE_COPY_SOURCES, manifest);
    expect(violations).toEqual([]);
  });

  it("M1 is public_marketable, operator_only, and authorizes exactly the ratified surfaces", () => {
    const { manifest } = loadSiteManifest();
    const m1 = getEntity(manifest, M1_ENTITY_ID)!;
    expect(m1.derivedPublicationStatus).toBe("public_marketable");
    expect(m1.availability).toBe("operator_only");
    expect([...m1.allowedSurfaces].sort()).toEqual(["cta", "faq", "homepage", "how_it_works", "proof"]);
    expect(m1.prohibitedClaims.length).toBe(8);
  });

  it("splitM1Claim separates the proven-fact and commercial-motion sentences", () => {
    const m1 = getM1ForSurface("homepage");
    const claim = splitM1Claim(m1.claimCeiling);
    expect(claim.provenFact).toMatch(/real end-to-end Produce/);
    expect(claim.commercialMotion).toMatch(/^For pilots,/);
  });

  it("getM1ForSurface refuses a surface the manifest did not authorize", () => {
    expect(() => getM1ForSurface("methodology")).toThrow(/does not authorize/);
  });

  it("the end-of-page pilot CTA renders on M1's surfaces and refuses any other page", () => {
    for (const host of ["how_it_works", "proof", "faq"] as const) {
      expect(PilotCta({ host })).not.toBeNull();
    }
    expect(() => PilotCta({ host: "methodology" })).toThrow(/does not authorize/);
  });

  it("FAQ copy contains no verbatim overlap with a prohibited claim's forbidden wording", () => {
    // Spot-check: none of the 8 prohibited-claim phrases' key forbidden fragments appear as an
    // affirmative claim in our own FAQ answers (they appear only as negated "No" answers).
    const faqText = FAQ_ITEMS.map((f) => f.a).join(" ").toLowerCase();
    expect(faqText).not.toMatch(/you can connect your own instagram/);
    expect(faqText).not.toMatch(/publish directly yourself/);
    expect(faqText).not.toMatch(/automatically, without/);
  });
});

describe("historical content stays historical (SOS-HISTORY-V1)", () => {
  it("every changelog entry is explicitly marked historicalClaimOnly and cites a real sha", () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of CHANGELOG_ENTRIES) {
      expect(entry.historicalClaimOnly).toBe(true);
      expect(entry.sha.length).toBeGreaterThanOrEqual(7);
      expect(["shortsos", "shortsos-site"]).toContain(entry.repo);
    }
  });

  it("every glossary entry carries an explicit historicalClaimOnly boolean", () => {
    expect(GLOSSARY_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of GLOSSARY_ENTRIES) {
      expect(typeof entry.historicalClaimOnly).toBe("boolean");
    }
  });

  it("current-truth page copy (home/how-it-works/proof/methodology/faq) never quotes changelog or glossary text", () => {
    // Mechanical, not eyeballed: the historical arrays must not bleed into current-truth
    // page copy.
    const currentTruthText = [HOME_INTRO, HOW_IT_WORKS_INTRO, PROOF_INTRO, METHODOLOGY_INTRO].join("\n");
    for (const entry of CHANGELOG_ENTRIES) {
      expect(currentTruthText).not.toContain(entry.title);
    }
    for (const entry of GLOSSARY_ENTRIES.filter((e) => e.historicalClaimOnly)) {
      expect(currentTruthText).not.toContain(entry.term);
    }
  });

  it("current-truth page source files are untouched by this mission's historical content", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const currentTruthFiles = [
      "src/app/page.tsx",
      "src/app/how-it-works/page.tsx",
      "src/app/proof/page.tsx",
      "src/app/faq/page.tsx",
      "src/app/request-pilot/page.tsx",
    ];
    for (const rel of currentTruthFiles) {
      const text = readFileSync(resolve(repoRoot, rel), "utf8");
      expect(text).not.toMatch(/historicalClaimOnly|CHANGELOG_ENTRIES|GLOSSARY_ENTRIES/);
    }
  });
});
