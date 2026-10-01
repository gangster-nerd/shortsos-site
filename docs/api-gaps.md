# API gap register

This register lists what ShortsOS-site needs from a source's API and does not get yet. The site
does not work around a gap ([AGENTS.md](../AGENTS.md)): content the API cannot provide stays
absent from the site. The register is therefore also the list of what stands between the API and
its use here.

**Source: TextOS, API V1.1.** Read on 2026-10-01 from the TextOS repository, without changing it,
at two commits:

- 8ba1815: the most advanced V1.1 code, on a branch;
- a0efa14: main.

Until G1 and G2 close, the site receives nothing from TextOS. The five Insights articles produced
outside the API were withdrawn on 2026-10-01 (29fdd57).

| # | What the site needs | What the API offers today | Status |
|---|---|---|---|
| G1 | An API it can call, with a workspace and a service token for ShortsOS | The V1.1 code is not merged into main, and main has no API. The rollout checklist (code, database, tenant, workspace, remote certification) records no step as passed. ShortsOS has no workspace and no token. | open |
| G2 | A release to a Git-published site | The only act is a non-public WordPress draft (`create_wordpress_draft`), and `wordpress` is the only destination. ADR-023 (proposed, on a branch) says ShortsOS-site and RepOS-site need a destination of their own, outside its scope. | open: [proposal below](#proposed-release-capability) |
| G3 | The content itself, in a form the site can render | An Article Review's artifact holds the draft's id, its title, its reading time, a CMO conformance result and a surface plan, which is a list of needs. It does not hold the ContentDocument. The document and its resolved surface stay inside TextOS; only the WordPress path reads them. | open |
| G4 | English (en-US) | Search demand is measured for fr-FR only; other locales are refused as unsupported. An Article Review takes its locale from the brief's query panel, so drafts are French in practice. ADR-023 says an English client needs a product decision (en-US or en-GB). | open |
| G5 | Articles written from product commits (commit-to-content) | No capability. Commit-to-content exists only inside TextOS. | open |
| G6 | The questions the site leaves unanswered (Site Intelligence) | No capability. TextOS's site crawler observes only, inside TextOS. | open |

Notes on each gap:

- **G3.** The release proposed below carries the ContentDocument. Rendering it as TextOS designs
  it (its CMO surface polish) also needs the resolved surface, or a rendering contract the site
  can implement. Without either, the site renders ContentDocument@1 with its own components. It
  never runs TextOS's code to match TextOS's rendering.
- **G4.** The site has a gap of its own here: it publishes in English only. It accepts fr-FR
  releases once its French pages ship (`locales` in `sources/textos.json`).
- **G5 and G6.** The withdrawn articles came from these two flows:
  - three engineering notes written from ShortsOS product commits;
  - two answers to buyer questions that a structural read of the site found unanswered.

  Through the API, they would be capabilities that end in a reviewed draft, which G2 then
  releases.

## Proposed release capability

This proposal is for the TextOS team. It mirrors what the API already does for WordPress drafts:
`prepare_wordpress_draft_action`, then a human Decision, then `create_wordpress_draft`. ShortsOS's
side is built against it: `sources/textos.json` names the capability and the contract, and
`packages/source-intake` verifies what comes back.

### `textos.release_headless_delivery@1`

- **Semantics:** act · E1 · R1 · async · `content:write` · TrustPolicy required.
- **Request:** through `POST /decisions`, with the payload
  `{ contentDraftId, destination: { kind: "headless_site", siteId } }`. TextOS derives the action
  server-side, as for `approve_panel@1`.
- **Refusal:** unless the workspace lists `siteId` among its headless destinations. This needs a
  destination registry beside the WordPress one.
- **Action envelope:**
  - `target = { kind: "headless_site", ref: siteId, protected: true }`;
  - `proposedStateHash = hashCanonical(delivery)`, the exact body it will release;
  - `truthVerdict: "pass"`.
- **Execution:** re-derives the delivery and the envelope, and fails if either changed since the
  approval. This is the same rule as for the WordPress draft.
- **Output artifact:** contract `textos-headless-delivery@1`, `mediaType: application/json`, and
  the body below (`packages/source-intake/src/delivery.ts`):

| Field | Source in TextOS |
|---|---|
| `destination { kind, siteId }`, `workspaceId` | the payload, the workspace |
| `locale` | the brief's panel locale (= `contentDocument.identity.language`) |
| `source { contentDraftId, briefId, writerMethodVersion, structuredContentHash }` | the content draft and its Geo Writer result |
| `truthCheck { verdict, truthCheckId }` | the draft's TruthCheck |
| `contentContract { version: "content-document@1", fingerprint }` | `CSE_CORE_MANIFEST.json` (sha256 of the schema) |
| `contentDocument` | `articleReview.contentDocument`, unchanged |
| `statementLedger` (recommended) | `structuredContent.statementLedger` (`id`, `text`, `kind`, `evidenceIds`) |

The site never edits the document. The URL, the publication date and indexing belong to the site,
which records them in its own files next to the release.

## Keeping this register

- A gap closes when a deployed API version that ShortsOS can call serves it. Record that version
  and the date in the Status column, then take the API path: receive, render, publish.
- A gap is never closed by a workaround on the site.
- When the site needs something new from the API, add a gap here before anything else.
