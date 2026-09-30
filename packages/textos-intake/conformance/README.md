# Conformance kit

Any implementation of the site-side intake proves it behaves like this one by passing these files.
That covers this package copied into another site, or a port to another language, such as a
WordPress importer. Nothing here needs TypeScript, a TextOS checkout or a network.

## Canonical hashing: `canonical-vectors.json`

For each vector, two things must hold byte for byte:

- `canonical(value)` equals `canonical`;
- `sha256(canonical)`, over its UTF-8 bytes in lowercase hex, equals `sha256`.

The values were computed by the TextOS API's own implementation; `computedWith` names the
repository, SHA and file. `../scripts/canonical-vectors.ts` recomputes them from a checkout at that
SHA.

The rule the vectors pin:

- object keys are sorted recursively by UTF-16 code units, not by locale and not by code point
  (an emoji key sorts before `U+FFFF`);
- arrays keep their order;
- the output is JSON with no whitespace, written as JavaScript's `JSON.stringify` writes it:
  - control characters become `\u00xx` in lowercase, and every other character stays unescaped;
  - numbers take their shortest round-trip form (`1e-7`, `1e+21`, `0.30000000000000004`).

## Verification: `cases/*.json`

Each case is a `textos-intake-conformance@1` file:

| Field | Meaning |
| --- | --- |
| `id`, `description` | what the case is about |
| `expectations` | what the site accepts: `siteId`, `workspaceId`, `locales`, `contentDocumentFingerprint`, `acceptedEngineShas` |
| `evidence` | the stored records, in `textos-intake-evidence@1` form |
| `expected` | `{ "ok": true, "artifactSha256", "decisionId" }`, or `{ "ok": false, "codes": [...] }` |

A case passes when the implementation does one of two things:

- it accepts an `ok` case and reports the same `artifactSha256` (the canonical hash of the
  artifact body) and the same `decisionId`;
- it refuses a failing case with exactly the listed set of codes, no more and no fewer. Order and
  repetitions do not matter.

The codes are listed with their checks in the package README, under "What is verified". To produce
the same set, an implementation follows three rules:

1. **Structure comes first.** If the evidence is not `textos-intake-evidence@1`, it is refused
   with `evidence_malformed` alone and nothing else is checked. That covers a missing field, or a
   principal id stored raw instead of as `sha256:<hex>`.
2. **Every chain check runs**, whatever failed before it.
3. **The delivery's content is checked only if the body parses** as
   `textos-headless-delivery@1`. Otherwise `delivery_malformed` joins the chain's codes, and the
   content checks are skipped.

The cases are synthetic: `../test/fixtures.ts` builds them, and none was received from TextOS.
Their expected outcomes are written by hand in `../test/conformance-cases.ts`, not computed by this
implementation. `../scripts/conformance.ts --write` regenerates the files from those definitions,
and without `--write` it checks them.
