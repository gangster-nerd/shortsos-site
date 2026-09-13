# `content-bundles/inputs/` — real manifest provenance

Unlike `product-manifest/` (a hand-authored, clearly-fake fixture — see its own `IMPORT.md`),
everything in this directory is the REAL product manifest, as synced by `SOS-CATCHUP-V1`.

- Product repository: `gangster-nerd/shortsos-v0` (local checkout `/Users/thelilmarco/Desktop/shortsos`).
- Product ref: see `pin.json` in this directory (deterministic half) and `../pin.json`
  (human-facing half, with `syncedAt`).
- Sync mechanism: `npm run content:sync -- --product-ref <sha> --product-repo-path <scratch-clone>`,
  run against a disposable scratch clone of the product repository checked out to that exact
  ref — never against the operator's own working checkout of that repo (see
  `../README.md` "Disclosed V1 simplification").
- Verification: `manifest.json` + `manifest.json.sha256` are verified byte-for-byte by
  `src/lib/commit-to-content/manifest-artifact.ts` (`verifyManifestArtifact`) — the same
  checksum routine `content:sync`/`content:verify` themselves run — via
  `src/lib/manifest/site-manifest.ts` (`loadSiteManifest`), which is what every page in this
  site actually calls for real copy. Fails closed on any checksum/version mismatch.

This directory (not `product-manifest/`) is the real source of truth pages must read.
