# AGENTS.md

Rules for anyone changing this repository, people and agents alike.

## One path: the API

Content made by another product reaches this site through that product's API, and no other way.
TextOS is the first such source.

- **No local workaround.** Never run a source's code, engine or prompts locally to produce,
  polish or render content for this site. Never copy a source's code into this repository. What
  the API cannot provide stays absent from the site.
- **A gap is a demand on the API.** When the site needs something the API does not offer, record
  it in [docs/api-gaps.md](docs/api-gaps.md) instead of building around the API.
- **The door is generic.** `packages/source-intake` receives from any source that speaks the
  release protocol, and names no product. What the site accepts from a source is in
  `sources/<id>.json`; the site's rules are in `src/lib/sources/intake.ts`. See
  [docs/sources.md](docs/sources.md).

Why: this site measures how far the API has come. Every local workaround is a false negative on
that test. A site that manages on its own where the API cannot deliver stops measuring the API
and becomes a showcase that flatters it.

Reading a source's repository to understand its API is fine. Changing it is not: ShortsOS never
modifies a source's repositories.

## The site does not grow sideways

Everything the site shows comes from a governed input:

- the product manifest the site is pinned to (`npm run content:sync`, `content-bundles/`);
- the site's own copy (`src/content/copy-sources.ts`), held to the manifest by copy-safety;
- a release received through the door.

A component fed any other way is a stray piece, and does not belong here.

## Before pushing

CI runs these, in order. Run them first:

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run content:verify && npm run validate:jsonld
```

- `content:verify` re-verifies the manifest pin, the commit ledger, and every received release.
- After changing `packages/source-intake`, bump its version, then run
  `npm run source-intake:manifest`.
