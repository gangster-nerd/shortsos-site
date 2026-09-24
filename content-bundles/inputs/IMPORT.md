# `content-bundles/inputs/` — real manifest provenance

Unlike `product-manifest/` (a hand-authored, clearly-fake fixture — see its own `IMPORT.md`),
everything in this directory is the REAL product manifest, first synced by `SOS-CATCHUP-V1`
(product ref `f01ac6110ec664aba31ee985a4c30d307de10b2f`) and re-synced by `SOS-CTC-V3`
(product ref `22e31cd6f7146813a31d90bbaa03b1ae554e5cd6`).

## Sync history

| Mission | Product ref | Manifest sha256 | Notes |
|---|---|---|---|
| `SOS-CATCHUP-V1` | `f01ac6110ec664aba31ee985a4c30d307de10b2f` | `b4bcc1095bb8dd8a36808f7f29e5f14ea4ab79504ff18302432a418547ee5239` | First real sync. |
| `SOS-CTC-V3` | `22e31cd6f7146813a31d90bbaa03b1ae554e5cd6` | `2251e88556f746550c8d99db89d6ffc919fc61992cb7ec11436c6f24468429a1` | First re-sync across a real governed product change (`36122a2`, evidence-bundle repair). Run against a disposable **full** (non-shallow) clone of the product repository. Diff vs the previous pin: `evidence` changed on six entities (phantom commit pins dropped or repointed); no entity's status, availability, `allowedSurfaces`, `claimCeiling`, `prohibitedClaims` or `knownLimits` changed; counts unchanged (1 / 8 / 30 / 3). |

Why the re-sync was required, not optional: at `f01ac611` the product repo's own
`public-truth:build` **refuses** to rebuild the manifest from a fresh full clone
(`UNRESOLVED EVIDENCE — refusing to write a manifest`, exit 1: six evidence bundles pin
commits that exist in no reachable history — reproduced during `SOS-CTC-V3`), so the
previously pinned manifest could not be re-derived from canonical history. At `22e31cd` it
rebuilds from a fresh full clone with the same counts and the same claims.

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
