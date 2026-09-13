/**
 * Single accessor for the one `public_marketable` entity, M1-REAL-PRODUCE-REVIEW-PUBLISH.
 * Every page that renders an M1 claim must go through `getM1ForSurface`, which asserts the
 * requested surface is actually in the manifest's own `allowedSurfaces` for M1 — a page
 * author cannot accidentally render M1's claim on a surface the manifest didn't authorize.
 *
 * `claimCeiling` is ratified as two deliberately distinct sentences (see
 * docs/governance/publication/2026-09-13-m1-public-marketable-ratification.md in the product
 * repo): a PROVEN FACT (past tense, exactly what the one real run showed) and a COMMERCIAL
 * MOTION (the pilot delivery model). `splitM1Claim` keeps them apart so no page can blend
 * them into one stronger-sounding sentence.
 */
import { getEntity } from "../registries/capability-registry";
import { loadSiteManifest } from "../manifest/site-manifest";
import type { ManifestEntity, Surface } from "../manifest/schema";

export const M1_ENTITY_ID = "M1-REAL-PRODUCE-REVIEW-PUBLISH";

export interface M1Claim {
  provenFact: string;
  commercialMotion: string;
}

/** Splits M1's claimCeiling at its ratified sentence boundary. Throws if the boundary moves
 *  (e.g. the ratified wording is edited) so a drift is caught, not silently mis-rendered. */
export function splitM1Claim(claimCeiling: string): M1Claim {
  const marker = ". For pilots,";
  const idx = claimCeiling.indexOf(marker);
  if (idx === -1) {
    throw new Error(
      "splitM1Claim: expected M1's claimCeiling to contain the ratified '. For pilots,' sentence boundary. " +
        "The ratified wording may have changed — update this splitter deliberately rather than guessing.",
    );
  }
  return {
    provenFact: `${claimCeiling.slice(0, idx)}.`,
    commercialMotion: claimCeiling.slice(idx + 2).trim(),
  };
}

export function getM1ForSurface(surface: Surface): ManifestEntity {
  const { manifest } = loadSiteManifest();
  const entity = getEntity(manifest, M1_ENTITY_ID);
  if (!entity) {
    throw new Error(`getM1ForSurface: ${M1_ENTITY_ID} not found in the synced manifest.`);
  }
  if (!entity.allowedSurfaces.includes(surface)) {
    throw new Error(
      `getM1ForSurface: manifest does not authorize ${M1_ENTITY_ID} for surface "${surface}" ` +
        `(allowedSurfaces: ${entity.allowedSurfaces.join(", ")}). Refusing to render its claim here.`,
    );
  }
  return entity;
}
