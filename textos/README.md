# `textos/` — ShortsOS as a client of TextOS

ShortsOS uses TextOS the way a TextOS client would: as a **tool**. Everything in this directory
is ShortsOS's own client record and the artefacts TextOS produced for it. Nothing here is TextOS
source, and nothing is ever written to a TextOS repository.

## The rule that makes this safe

`scripts/textos/run.ts` is the only way ShortsOS code reaches TextOS code. Before a step runs, it
checks that the TextOS checkout passed with `--textos-path`:

- sits at exactly the writer SHA pinned in `tool.json`;
- has a clean working tree (no tracked change, no untracked file).

The step then runs under TextOS's own `tsx` and `tsconfig.json`, importing TextOS modules
dynamically from that checkout. ShortsOS modules are imported by relative path only. After the
step, the working tree is checked again, and a step that left any trace in the checkout fails.

| Pin | Ref | What it is used for |
|---|---|---|
| writer | `feat/ctc-r1-pilot-a` @ `a0f6591` (2026-09-23) | CTC seam, geo-writer@0.2, editorial-voice prompt `geo-writer-slot@0.3`, evidence approval and public-use clearance, TruthCheck, ContentDocument@1 bridge, surface resolution, headless JSON. Site Intelligence runs from the same checkout. |
| clientFlow | `feat/pa-draft-integration-1` @ `61aea32` (2026-09-23) | Contract reference only: operator question proposals and their canonical metadata. Not executed. |

## Two flows, one editorial plan

The two provenances stay separate, as TextOS's CTC seam requires: a product commit never produces
a site snapshot, an authority gap or an opportunity. They meet in a ShortsOS **brief**
(`briefs/<articleId>.json`), which is the editorial plan written down.

**Commit-to-Content.** The chain is: product commits → why the article exists → HUMAN_CMO buyer
question → TextOS CTC intake → geo-writer → TruthCheck → ContentDocument.

- Output: engineering notes under `/insights/`, on the manifest surface `developer_note`.
- No capability is claimable on that surface, so these notes make historical statements only.
- Evidence quotes commit messages verbatim. It is checked for `controlled_preview`: commit-derived
  facts carry no human public-use clearance yet.

**Site Intelligence (client flow).** The chain is: TextOS Site Intelligence crawl of this site →
where the site gives no in-depth answer to an operator-proposed buyer question → same writer and
checks.

- Output: answers under `/insights/`, on the manifest surface `faq`, where the manifest authorizes
  M1's claim.
- Evidence quotes only ratified manifest wording. It is cleared for `public_web` through TextOS's
  `clearEvidenceForPublicUse`, and the authority recorded for that clearance is the owner's
  ratification of 2026-09-13.
- The site-snapshot lineage lives in the brief (`siteObservation`), next to the CTC provenance and
  never inside it.

**Measurement was not run.** TextOS measures answer engines only after a human approves the
question panel, and only with a live key. `client/operator-question-proposals.json` is ready for
that approval. Until it happens, no article here claims to come from a measured opportunity, and
every target query is `HUMAN_CMO` with demand `NOT_MEASURED`.

## Who wrote the slots

The TextOS writer calls its slot provider once per slot. Its live provider,
`ClaudeGeoWriterSlotProvider`, has an injectable transport. No API key was available, so in these
runs the transport was the operator: a Claude Code session working as ShortsOS CTO/CMO answered
each exact prompt that TextOS rendered. `prepare` writes those prompts to `runs/<id>/prompts/`,
which git ignores; only their hashes are committed, in `runs/<id>/adapt.json`.

TextOS's own provider class still built every prompt and parsed every answer. `write` refuses an
answer unless the prompt TextOS renders at write time hash-matches the prompt that was answered.
The recorded provider identity is `operator:claude-code|geo-writer-slot@0.3`, never the API model,
which did not run.

To run the live model instead, construct `ClaudeGeoWriterSlotProvider` without a transport in
`steps/write.ts`, with an `ANTHROPIC_API_KEY` and a call budget. Nothing else changes.

## Commands

```bash
# 0. Product truth at <sha> (see content-bundles/README.md).
npm run content:sync -- --product-ref <sha> --product-repo-path <full product clone at <sha>>

# 1. Site Intelligence on the built site (serves out/ on 127.0.0.1:4317, read-only).
npm run build
npm run textos -- site-intelligence --textos-path <textos checkout at the pinned writer SHA>
npm run textos -- site-intelligence --out after-publication --textos-path <...>

# 2. Brief → TextOS intake → plan → exported slot prompts.
npm run textos -- prepare --article <articleId> --textos-path <...> --product-repo-path <product clone>

# 3. Answer runs/<articleId>/prompts/* in runs/<articleId>/responses/*.json, then:
npm run textos -- write --article <articleId> --textos-path <...>

# 4. Record the brief's commits in the public ledger (the build fails until they are there).
npm run content:commits -- --product-ref <same sha> --product-repo-path <same clone>
```

`prepare` fails if any evidence quote is not verbatim in its source. The sources are a commit
message, a product file at the pinned ref, or a manifest field. Every cited commit must be in the
history of the pinned product ref.

`write` fails on any writer refusal and on any TruthCheck verdict other than `pass`. Only a `pass`
is packaged.

## What each run commits (`runs/<articleId>/`)

| File | Produced by |
|---|---|
| `intake.json`, `evidence-usability.json`, `clearance-receipts.json`, `adapt.json` (with the prompt hashes) | `prepare` (TextOS approval, clearance, CTC adapter, prompt builder) |
| `responses/` | the operator |
| `writer-outcome.json`, `lineage.json`, `content-document.json`, `resolved-surface.json`, `article-structure.json`, `receipt.json`, `HUMAN-REVIEW.md` | `write` (TextOS writer, TruthCheck, bridge, surface resolution, headless JSON) |

## What the site checks without TextOS (CI, tests, build)

`src/lib/textos/articles.ts` refuses to render an article unless all of these hold:

- the receipt names the pinned writer SHA and a TruthCheck `pass`;
- the committed ContentDocument and resolved surface hash-match the receipt;
- every rendered sentence is the writer's own slot text;
- every cited commit is in the ledger, and the ledger holds nothing else;
- every named entity is in the manifest;
- a `faq` answer names only entities that authorize `faq`;
- no developer note restates a claim ceiling;
- the site is not indexable while any preview-only article is published.

## What this public repository does not carry

This repository is public; the ShortsOS product repository and TextOS are private. So:

- **No TextOS prompt text.** Prompts are regenerated by `prepare` at the pinned TextOS SHA. The
  committed hashes are enough for `write` to refuse a stale answer.
- **No product history beyond what is cited.** The ledger lists the cited commits and the pinned
  tip, with date and subject only.

What it does carry, because the articles are built on it: the evidence quotes in each brief and
intake (excerpts of cited commit messages, product files and manifest fields), TextOS's artefact
formats, and the TextOS refs in `tool.json`.

## Not done, on purpose

- **No live model call.** There was no key; see "Who wrote the slots".
- **No measurement.** A human must approve the question panel, and the live provider is absent.
- **Human review is still pending for every article.** Publication was mandated by the owner.
  `HUMAN-REVIEW.md` is the reviewer's packet. `publication.humanReview` in each brief records the
  outcome once a reviewer has read the article.
- **No automatic trigger on product commits.** The product side emits almost no change-impact
  records yet (one record exists), so there is nothing to select candidates from.
- **Nothing written to any TextOS repository.**
