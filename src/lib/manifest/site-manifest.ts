/**
 * Loads the REAL, `content:sync`-produced product manifest that pages render from —
 * `content-bundles/inputs/manifest.json` + its `.sha256` sidecar, committed verbatim by
 * `scripts/content-sync.ts` (see `content-bundles/README.md`).
 *
 * This is deliberately NOT `../manifest/loader.ts` (`loadCapabilityManifest`): that loader
 * reads `product-manifest/` — a hand-authored, clearly-fake fixture directory kept only to
 * exercise the loader/registries/copy-safety checks before any real manifest existed (see
 * `product-manifest/IMPORT.md`). Its two `EXAMPLE-PLACEHOLDER-*` entities must never be
 * rendered on a live route. Real page copy must read the manifest below instead, which is
 * fail-closed verified with the same `verifyManifestArtifact` routine `content:sync` and
 * `content:verify` themselves use — reused here rather than re-implemented so there is one
 * checksum-verification code path, not two.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { verifyManifestArtifact } from "../commit-to-content/manifest-artifact";
import type { CapabilityManifest } from "./schema";

const INPUTS_DIR = join(process.cwd(), "content-bundles", "inputs");
const MANIFEST_FILE_NAME = "public-product-manifest.json";

export interface LoadedSiteManifest {
  manifest: CapabilityManifest;
  checksum: string;
  productRef: string;
}

let cached: LoadedSiteManifest | null = null;

export function loadSiteManifest(): LoadedSiteManifest {
  if (cached) return cached;

  const manifestRaw = readFileSync(join(INPUTS_DIR, "manifest.json"), "utf8");
  const sidecarRaw = readFileSync(join(INPUTS_DIR, "manifest.json.sha256"), "utf8");
  const { productRef } = JSON.parse(readFileSync(join(INPUTS_DIR, "pin.json"), "utf8")) as { productRef: string };

  const { manifest, checksum } = verifyManifestArtifact({
    manifestRaw,
    sidecarRaw,
    manifestFileName: MANIFEST_FILE_NAME,
  });

  cached = { manifest, checksum, productRef };
  return cached;
}
