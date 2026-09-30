# textos-intake

The site-side door for content released by the **TextOS API** to a **Git-published site**
(a static or headless site whose pages are built from files in its repository).

It pulls a release, re-verifies every hash and the human approval behind it, applies the site's
own rules, and writes the release into the repository through a small adapter. It is written for
any such site: it imports nothing but Node built-ins and names no site (`test/boundary.test.ts`).
ShortsOS-site is its first user (`src/lib/textos/api-intake.ts`, `scripts/textos/intake.ts`).

## Status: the TextOS side does not exist yet

TextOS API V1.1 releases content to WordPress only. Git-published sites have no destination yet
(TextOS ADR-023). This package is built against the capability and contract proposed below. Until
TextOS serves them, `request` gets `404 not_found`, which is also what the API answers for a
capability it does not expose.

Everything else runs today: the verification, the adapter contract, the no-overwrite writer, and
the build-time re-verification. They are tested on synthetic releases (`test/fixtures.ts`) that
are never written into a site.

## How a release reaches a site

```
TextOS                                             the site (its own service token)
──────                                             ────────────────────────────────
Article Review ready (contentDraftId)
                                      ◀── request   POST /decisions  release_headless_delivery@1
derive the exact action:                            { contentDraftId, destination: { siteId } }
  target = headless_site:<siteId>
  proposedStateHash = hash(delivery)
a person approves THIS action ──▶ TrustGrant
                                      ◀── receive   GET decision (approved + grant)
                                                    POST /invoke with trustGrantId + executionPayload
release job runs, re-derives the action,            poll the job
emits artifact textos-headless-delivery@1 ──▶       GET artifact, GET receipt, GET decision
                                                    verify everything → adapter → files
                                                    → a pull request a person merges
```

The site does the asking and the reading because the API lets only the principal that requested
a decision, or invoked a job, read it back. TextOS never needs write access to the site's
repository.

## What is verified

`verifyEvidence` recomputes the chain instead of reading it. Everything must hold, and every
failure is reported with a code:

| Check | Failure code |
|---|---|
| `hashCanonical(artifact.body) = artifact.sha256` | `artifact_hash_mismatch` |
| the artifact is `textos-headless-delivery@1` (an Article Review or a WordPress draft is not a release) | `artifact_not_a_delivery` |
| job, receipt, decision and grant are all for `textos.release_headless_delivery@1` | `capability_mismatch` |
| job ↔ receipt ↔ artifact name each other; `receipt.outputHash` = the body hash | `receipt_mismatch` |
| `receipt.inputHash = hashCanonical(executionPayload)`: the job ran the approved payload | `input_not_the_approved_payload` |
| the decision is `approved`, `requiredRole: human`, resolved by someone | `decision_not_approved`, `decision_not_human` |
| `hashCanonical(envelope)` = the decision's, the receipt's and the job's `actionEnvelopeHash` | `envelope_mismatch` |
| the grant was issued by that human decision, for that action, and the job ran under it | `grant_mismatch` |
| `envelope.proposedStateHash` = the body hash: the person approved exactly these bytes | `approval_does_not_cover_this_content` |
| the action and the delivery both name this site | `destination_mismatch` |
| every record belongs to the site's workspace | `workspace_mismatch` |
| the job succeeded | `job_not_succeeded` |
| the engine SHA is one the site accepts (or `"any"`, recorded) | `engine_not_accepted` |
| the document was validated against the ContentDocument@1 schema the site pins (fingerprint) | `content_contract_mismatch` |
| the locale is one the site publishes | `locale_not_served` |
| `contentDocument.provenance.sourceEvidenceDigest` = the writer's `structuredContentHash` | `structured_hash_mismatch` |
| TruthCheck `pass`, on the delivery and on the approved action | `truthcheck_not_pass` |
| structure: known block kinds, unique block ids, slug, claims in the statement ledger | `delivery_malformed` |

Canonical hashing is byte-for-byte the API's rule. `test/canonical.test.ts` holds vectors computed
with the TextOS implementation itself.

## What a site keeps

`textos-intake-evidence@1` holds the job, the artifact, the receipt, the decision, the action
envelope, the execution payload and the grant, as the API served them. Principal ids are replaced
by `sha256:<hex>`, so a public repository never carries an account identifier; no verified hash
covers them. Every build re-verifies the release from this file (`checkCommittedDelivery`), with no
network and no token, and compares the files the adapter would write with what is committed. A
received release is never edited by hand, and never overwritten.

## Adopting it in a site

1. **Copy the package** (it has no dependencies). A site that vendors TextOS code with a tree
   digest, as RepOS-site does for the CSE core, can vendor this folder the same way.
2. **Commit a configuration** with what the site accepts (the `IntakeExpectations`): its `siteId`,
   the TextOS `workspaceId` it is the destination of, the `locales` it publishes, the
   ContentDocument@1 schema fingerprint it renders against, and the engine SHAs it accepts. These
   come from the repository, never from the API.
3. **Write a `SiteAdapter`**:
   - `review(verified)` returns the site's own refusals (slug collisions, forbidden wording,
     blocks the site cannot show…);
   - `plan(verified)` returns the files the release becomes. It must be a pure function of the
     verified release, so that the build can re-derive it.
4. **Wire the gestures**: `requestRelease`, `collectRelease` + `receiveDelivery` (writes all or
   nothing), and `checkCommittedDelivery` in the build.

### ShortsOS-site (done)

- Releases land in `textos/api/<slug>/` as `evidence.json` and `intake.json`.
- The site accepts `en-US` for now. A French release is refused until the French pages ship.
- Its own rules: no self-serve wording (M1), no slug of an existing article, no block an insights
  page cannot show, no conversion, and pages never name the tool.
- `content:verify` re-verifies every committed release.
- `.github/workflows/textos-intake.yml` is the manual button: it receives a release, runs every
  gate and pushes a branch for review.
- Received releases are not rendered yet.

### RepOS-site

- RepOS publishes `fr-FR`, which is what the API produces today.
- Its adapter would write the evidence under `textos-client/`. It would also write the article
  record `content/articles/<slug>.json` (`repos-site.article-record@1`), with `document` set to
  the delivered ContentDocument and `publication` left `draft`.
- RepOS's own gate 2 decides publication, as it does now. Its build gates (CONTENT_PASS,
  FIDELITY_PASS, confidentiality) keep applying.
- Its lineage schema knows two flows, `commit-to-content` and `site-intelligence`. An API release
  is a third flow, and RepOS would add it. The delivery's `statementLedger` maps onto its
  statements. Slot-level lineage is not part of this contract, so FIDELITY_PASS would compare
  against the ledger.

### Les Jardiniers

- TextOS releases Les Jardiniers' content to WordPress today, as governed drafts with their own
  trust path. This package does not replace that.
- If Les Jardiniers gets a Git-published front, it adopts the package like the sites above, with
  its own `siteId`.
- A non-Git front (WordPress) would keep its own importer. The verification rules above still
  apply there, and the canonical hash is about twenty lines in any language.

## Proposed TextOS capability

This is for the TextOS team. It is written to match what the API already does for WordPress drafts
(`prepare_wordpress_draft_action` → human Decision → `create_wordpress_draft`).

**`textos.release_headless_delivery@1`**

- Semantics: act · E1 · R1 · async · `content:write` · TrustPolicy required.
- Requested through `POST /decisions` with payload `{ contentDraftId, destination: { kind:
  "headless_site", siteId } }`. TextOS derives the action server-side, as for `approve_panel@1`.
- Refused unless the workspace lists `siteId` among its headless destinations: a destination
  registry beside the WordPress one.
- Action envelope:
  - `target = { kind: "headless_site", ref: siteId, protected: true }`;
  - `proposedStateHash = hashCanonical(delivery)` — the exact body it will release;
  - `truthVerdict: "pass"`.
- Execution re-derives the delivery and the envelope, and fails if either changed since the
  approval. Same rule as the WordPress draft.
- Output artifact: contract `textos-headless-delivery@1`, `mediaType: application/json`, and this
  body (`src/delivery.ts`):

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
