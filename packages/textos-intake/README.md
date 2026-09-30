# textos-intake

The site-side door for content released by the **TextOS API** to a **Git-published site**
(a static or headless site whose pages are built from files in its repository).

It pulls a release, re-verifies every hash and the human approval behind it, applies the site's
own rules, and writes the release into the repository. It is written for any such site: it imports
nothing but Node built-ins and names no site (`test/boundary.test.ts`). A site supplies a
configuration file and its rules; the command, the release layout and the build re-check are the
package's. ShortsOS-site is its first user.

## Status: the TextOS side does not exist yet

TextOS API V1.1 releases content to WordPress only. Git-published sites have no destination yet
(TextOS ADR-023). This package is built against the capability and contract proposed below. Until
TextOS serves them, `request` gets `404 not_found`, which is also what the API answers for a
capability it does not expose.

Everything else runs today: the verification, the command, the no-overwrite writer, the build
re-check and the conformance kit. They are tested on synthetic releases (`test/fixtures.ts`) that
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

Canonical hashing is byte for byte the API's rule. `conformance/canonical-vectors.json` holds
vectors computed with the TextOS implementation itself (see "Proving a copy behaves the same").

## What a site keeps

A release lands in `<releasesDir>/<slug>/` as two files, plus any file the site's rules add:

- `evidence.json` (`textos-intake-evidence@1`): the job, the artifact, the receipt, the decision,
  the action envelope, the execution payload and the grant, as the API served them. Principal ids
  are replaced by `sha256:<hex>`, so a public repository never carries an account identifier; no
  verified hash covers them.
- `intake.json` (`textos-intake-record@1`): what was received, and which decision approved it and
  when.

Every build re-verifies each release from its evidence (`check`, or `verifyCommittedReleases`),
with no network and no token. It re-derives the files and compares them byte for byte with what is
committed. A received release is never edited by hand, never overwritten, and its folder holds
nothing the intake did not write.

## Adopting it in a site

A site writes a configuration file and its rules; the rest is the package. `template/` holds a
starting point for each step, and `test/template.test.ts` runs them as shipped.

1. **Copy a published version, and prove the copy.** Copy the folder byte for byte, with its
   `MANIFEST.json` and without line-ending conversion, and record the version and tree digest you
   took. Then run
   `tsx <copy>/scripts/manifest.ts verify --expect <tree digest>` in the site's CI. It fails on any
   file changed, added or missing (see "Versions").
2. **Commit a configuration** (`textos-intake-config@1`, from `template/textos-intake.config.json`).
   What the site accepts comes from its repository, never from the API:

   | Field | Meaning |
   |---|---|
   | `siteId` | the id TextOS addresses the site by |
   | `workspaceId` | the TextOS workspace the site receives from; `null` receives nothing |
   | `locales` | the languages the site publishes |
   | `contentDocumentFingerprint` | the ContentDocument@1 schema the site renders against |
   | `acceptedEngineShas` | `"any"` (each release records its engine), or a list of reviewed engines |
   | `releasesDir` | where a release lands, as `<releasesDir>/<slug>/` |

3. **Write the site's rules** (from `template/site-rules.ts`). Compose the package's building
   blocks — `slugNotTaken`, `onlyBlockKinds`, `noConversion`, `forbidText`, `forbidPhrases` — and
   add the site's own. `extraFiles` adds files in the site's own format, such as an article record.
   Like the rest, they must depend on the verified release alone.
4. **Add the command** (from `template/intake-cli.ts`). `runIntakeCli` offers `request`,
   `receive`, `replay` and `check`; `request` and `receive` read `TEXTOS_API_BASE_URL` and
   `TEXTOS_API_TOKEN`.
5. **Wire the build and the button.** Run `check` in the build. Copy `template/textos-intake.yml`
   to receive an approved release from GitHub: it runs the gates and pushes a branch for a person
   to open as a pull request.

### ShortsOS-site (done)

- Configuration: `textos/client/api-intake.json`. Releases land in `textos/api/<slug>/`.
- The site accepts `en-US` for now. A French release is refused until the French pages ship.
- Its rules (`src/lib/textos/api-intake.ts`) compose five building blocks:
  - no slug of an existing article;
  - no block an insights page cannot show;
  - no conversion;
  - no self-serve wording (M1);
  - pages never name the tool.
- Its command is three lines (`scripts/textos/intake.ts`), and `content:verify` re-verifies every
  committed release.
- `.github/workflows/textos-intake.yml` is the manual button.
- Received releases are not rendered yet.

### RepOS-site

- RepOS publishes `fr-FR`, which is what the API produces today.
- Its releases would land under `textos-client/`. Its rules' `extraFiles` would also write the
  article record `content/articles/<slug>.json` (`repos-site.article-record@1`), with `document`
  set to the delivered ContentDocument and `publication` left `draft`.
- RepOS's own gate 2 decides publication, as it does now. Its build gates (CONTENT_PASS,
  FIDELITY_PASS, confidentiality) keep applying.
- Its lineage schema knows two flows, `commit-to-content` and `site-intelligence`. An API release
  is a third flow, and RepOS would add it. The delivery's `statementLedger` maps onto its
  statements. Slot-level lineage is not part of this contract, so FIDELITY_PASS would compare
  against the ledger.

### textos-site

- Its toolchain already fits: a static Next.js export, TypeScript `bundler` resolution, tsx,
  vitest and Node 22. Its articles are ContentDocument@1.
- It publishes in `en`, while the API writes `fr-FR` only.
- Adopting the package there is the TextOS team's work: ShortsOS never modifies TextOS
  repositories.

### Les Jardiniers

- TextOS releases Les Jardiniers' content to WordPress today, as governed drafts with their own
  trust path. This package does not replace that.
- If Les Jardiniers gets a Git-published front, it adopts the package like the sites above, with
  its own `siteId`.
- A non-Git front (WordPress) would keep its own importer. The conformance kit proves that
  importer follows the same rules; the canonical hash is about twenty lines in any language.

## Proving a copy behaves the same

- `conformance/` is language-neutral: any implementation runs it, whether a copy of this package
  or a port to another language (see `conformance/README.md`). It holds:
  - canonical-hash vectors computed by TextOS;
  - 30 verification cases whose expected outcomes are written by hand.
- `scripts/canonical-vectors.ts` recomputes the vectors with TextOS's own code, from a checkout at
  the pinned SHA. It only reads the checkout, which must be clean before and after.
- `test/e2e.test.ts` runs the whole command over HTTP against a local stand-in API.

## Versions

`MANIFEST.json` (`textos-intake-manifest@1`) gives the sha256 of every file of the version, and
their tree digest. A shell recomputes the digest without this code:

```sh
cd <package copy>
find . -type f ! -path './MANIFEST.json' ! -path '*/node_modules/*' | sed 's#^\./##' | LC_ALL=C sort \
  | while read -r f; do printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done | sha256sum
```

| Version | Tree digest | What changed |
|---|---|---|
| 0.1.0 | `c0d179e2613a9fded8417e8fb6bfb503fa5ccfe53f3387aa06c151325bd3ea13` | First version (commit 8716d07), before the manifest existed. |
| 0.2.0 | in `MANIFEST.json` | The command, the site kit, the rules and the templates move into the package; conformance kit; replayable proofs; the manifest. |

A version is published once its manifest is committed. After a change, bump `version` in
`package.json`, then rewrite the manifest (`npm run textos-intake:manifest` in ShortsOS-site). A
test fails on a stale manifest. Rewriting refuses to change the tree of a version already
published.

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
