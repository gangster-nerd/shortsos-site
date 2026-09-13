# Manifest import provenance

**STATUS: PLACEHOLDER.** The manifest committed alongside this file (`capability-manifest.json`
+ `.sha256`) is a hand-authored, clearly-fake example, seeded by SOS-SITE-0 solely to exercise
the manifest loader, registries, and copy-safety checks before any real manifest exists. Its two
entities (`EXAMPLE-PLACEHOLDER-CAPABILITY-1`, `EXAMPLE-PLACEHOLDER-CAPABILITY-2`) describe nothing
real about ShortsOS and must never be rendered on any live route as if they were product truth.
Every page that reads this manifest must treat it as test fixture data only, pending the first
real `content:sync`.

## Why there is no real import yet

- The product repository (`shortsos`) computes its Public Truth manifest via
  `npm run public-truth:build`, which writes `.artifacts/public-product-manifest.json` +
  `.sha256`. That output directory is git-ignored in the product repo — there is currently no
  committed, network-fetchable, or CI-published manifest artifact to import.
- `SOS-PUBLIC-TRUTH-V1` (the mission that built the manifest schema and builder) is closed and its
  governance record published, but its code lives on an unmerged branch
  (`mission/sos-public-truth-v1`) that has not landed on the product repo's `main`. A sibling
  mission (`SOS-PUBLIC-TRUTH-POLICY-V1`) is amending the publication-policy logic in parallel and
  has not merged either.
- There is no manifest EXPORT step in the product repo today (no CI job, no published artifact,
  no versioned release). Building one is a real, disclosed follow-up need — not something this
  mission fakes with a simulated network fetch.

## What `content:sync` actually does today (see `../scripts/content-sync.ts`)

Reads the manifest by regenerating it from a local checkout of the product repository at a
pinned git ref (`--product-repo-path`, defaulting to `../shortsos`), by shelling out to
`npm run public-truth:build` there and reading its `.artifacts/public-product-manifest.json`
output directly off disk. This is an honest, disclosed simplification: a real cross-repo sync
would need either a published manifest artifact URL (once the product repo has an export/CI step)
or a git submodule/subtree pinning a specific commit's tree without a full working checkout. A
local relative path (or an explicit path flag) is what V1 actually does — no network call is made
beyond what `npm run public-truth:build` itself might need (none, today), and this is the only
network-adjacent behavior in this tooling.

## Reimport procedure, once a real export exists

1. Confirm the product repo has published a manifest artifact from a specific commit (via a
   built export/CI step that does not exist as of this writing).
2. Fetch `capability-manifest.json` + `.sha256` together — never independently, or the pair
   becomes internally inconsistent and the loader will refuse it (checksum mismatch).
3. Replace both files here, and rewrite this document with: product repository, product SHA,
   CI run reference, artifact reference, import date, and who reviewed the diff.
4. Run `npm run content:verify` to confirm the loader accepts the new manifest and no committed
   content bundle silently drifted.

## Fields for the (still hypothetical) real import

| | |
|---|---|
| Product repository | `gangster-nerd/shortsos-v0` (local checkout referenced during development: `/Users/thelilmarco/Desktop/shortsos`) |
| Product SHA | n/a — no real import has happened yet |
| CI run | n/a, no CI configured yet in the product repo for a manifest export step |
| Artifact reference | n/a — `.artifacts/public-product-manifest.json` is git-ignored in the product repo, never published |
| Imported | n/a |
| Reviewed by | n/a |
| Entities | 0 real (2 placeholder, fake, see above) |
