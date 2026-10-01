# source-intake

The site-side door for content an external **source** releases through its API to a
**Git-published site**: a static or headless site whose pages are built from files in its
repository.

It pulls a release, re-verifies every hash and the human approval behind it, applies the site's
own rules, and writes the release into the repository. It is written for any such site and any
source that speaks the release protocol below. It imports nothing but Node built-ins, and names
no product and no site (`test/boundary.test.ts`). A site supplies one configuration file per
source and its rules; the command, the release layout and the build re-check are the package's.

The package holds no source's code. What a site receives, and from which source, is in the site's
own configuration.

## The release protocol

A source that releases to a site through this door serves, under
`/api/v1/workspaces/{workspaceId}/`:

- `POST decisions` and `GET decisions/{id}`: a person's decision on one exact action, with its
  action envelope, execution payload and trust grant;
- `POST invoke`: running a capability under a trust grant, as a durable job;
- `GET jobs/{id}`, `GET artifacts/{id}`, `GET receipts/{id}`: the job, its output and its receipt.

Every hash is the sha256 of canonical JSON (`src/canonical.ts`, `conformance/canonical-vectors.json`).

```
the source                                         the site (its own service token)
──────────                                         ────────────────────────────────
a reviewed draft (contentDraftId)
                                      ◀── request   POST /decisions  <release capability>
derive the exact action:                            { contentDraftId, destination: { kind, siteId } }
  target = <targetKind>:<siteId>
  proposedStateHash = hash(delivery)
a person approves THIS action ──▶ TrustGrant
                                      ◀── receive   GET decision (approved + grant)
                                                    POST /invoke with trustGrantId + executionPayload
release job runs, re-derives the action,            poll the job
emits the delivery artifact ──▶                     GET artifact, GET receipt, GET decision
                                                    verify everything → adapter → files
                                                    → a pull request a person merges
```

The site does the asking and the reading because the protocol lets only the principal that
requested a decision, or invoked a job, read it back. The source never needs write access to the
site's repository.

A source names three things its own way, and the site records them in its configuration
(`release`):

| Field | Meaning |
|---|---|
| `capability` | the capability that releases a reviewed draft to a site |
| `deliveryContract` | the contract id of the released artifact, and its body's `schemaVersion` |
| `targetKind` | the destination kind in the payload, the action's target and the delivery |

### The delivery

The released artifact is `application/json`, under the configured contract, with this body
(`src/delivery.ts`):

| Field | Meaning |
|---|---|
| `schemaVersion` | the configured `deliveryContract` |
| `destination { kind, siteId }`, `workspaceId` | the one site and the workspace it is released to |
| `locale` | BCP 47; equals `contentDocument.identity.language` |
| `source { contentDraftId, briefId, writerMethodVersion, structuredContentHash }` | the reviewed draft, and the writer's hash of the structured content |
| `truthCheck { verdict, truthCheckId }` | the truth check of the draft |
| `contentContract { version: "content-document@1", fingerprint }` | the ContentDocument@1 JSON Schema the document was validated against |
| `contentDocument` | the document, unchanged |
| `statementLedger` (recommended) | the writer's statements (`id`, `text`, `kind`, `evidenceIds`) |

The site never edits the document. The URL, the publication date and indexing belong to the site,
which records them in its own files next to the release.

## What is verified

`verifyEvidence` recomputes the chain instead of reading it. Everything must hold, and every
failure is reported with a code:

| Check | Failure code |
|---|---|
| `hashCanonical(artifact.body) = artifact.sha256` | `artifact_hash_mismatch` |
| the artifact is the configured delivery contract (a review result or any other output is not a release) | `artifact_not_a_delivery` |
| job, receipt, decision and grant are all for the configured release capability | `capability_mismatch` |
| job ↔ receipt ↔ artifact name each other; `receipt.outputHash` = the body hash | `receipt_mismatch` |
| `receipt.inputHash = hashCanonical(executionPayload)`: the job ran the approved payload | `input_not_the_approved_payload` |
| the decision is `approved`, `requiredRole: human`, resolved by someone | `decision_not_approved`, `decision_not_human` |
| `hashCanonical(envelope)` = the decision's, the receipt's and the job's `actionEnvelopeHash` | `envelope_mismatch` |
| the grant was issued by that human decision, for that action, and the job ran under it | `grant_mismatch` |
| `envelope.proposedStateHash` = the body hash: the person approved exactly these bytes | `approval_does_not_cover_this_content` |
| the action and the delivery both name this site, as the configured target kind | `destination_mismatch` |
| every record belongs to the site's workspace | `workspace_mismatch` |
| the job succeeded | `job_not_succeeded` |
| the engine SHA is one the site accepts (or `"any"`, recorded) | `engine_not_accepted` |
| the document was validated against the ContentDocument@1 schema the site pins (fingerprint) | `content_contract_mismatch` |
| the locale is one the site publishes | `locale_not_served` |
| `contentDocument.provenance.sourceEvidenceDigest` = the writer's `structuredContentHash` | `structured_hash_mismatch` |
| truth check `pass`, on the delivery and on the approved action | `truthcheck_not_pass` |
| structure: known block kinds, unique block ids, slug, claims in the statement ledger | `delivery_malformed` |

## What a site keeps

A release lands in `<releasesDir>/<slug>/` as two files, plus any file the site's rules add:

- `evidence.json` (`source-intake-evidence@1`): the job, the artifact, the receipt, the decision,
  the action envelope, the execution payload and the grant, as the API served them. Principal ids
  are replaced by `sha256:<hex>`, so a public repository never carries an account identifier; no
  verified hash covers them.
- `intake.json` (`source-intake-record@1`): the source, what was received, and which decision
  approved it and when.

Every build re-verifies each release from its evidence (`check`, or `verifyCommittedReleases`),
with no network and no token. It re-derives the files and compares them byte for byte with what is
committed. A received release is never edited by hand, never overwritten, and its folder holds
nothing the intake did not write.

## Adopting it in a site

A site writes one configuration file per source, and its rules; the rest is the package.
`template/` holds a starting point for each step, and `test/template.test.ts` runs them as shipped.

1. **Copy a published version, and prove the copy.** Copy the folder byte for byte, with its
   `MANIFEST.json` and without line-ending conversion, and record the version and tree digest you
   took. Then run
   `tsx <copy>/scripts/manifest.ts verify --expect <tree digest>` in the site's CI. It fails on any
   file changed, added or missing (see "Versions").
2. **Commit a configuration per source** (`source-intake-config@1`, from `template/source.json`),
   as `sources/<id>.json`. What the site accepts comes from its repository, never from the API:

   | Field | Meaning |
   |---|---|
   | `source` | the source's id: lowercase letters and digits, the file's name |
   | `siteId` | the id the source addresses the site by |
   | `workspaceId` | the source's workspace the site receives from; `null` receives nothing |
   | `release` | how the source names a release: `capability`, `deliveryContract`, `targetKind` |
   | `locales` | the languages the site publishes |
   | `contentDocumentFingerprint` | the ContentDocument@1 schema the site renders against |
   | `acceptedEngineShas` | `"any"` (each release records its engine), or a list of reviewed engines |
   | `releasesDir` | where a release lands, as `<releasesDir>/<slug>/`; one folder per source |

3. **Write the site's rules** (from `template/site-rules.ts`). Compose the package's building
   blocks — `slugNotTaken`, `onlyBlockKinds`, `noConversion`, `forbidText`, `forbidPhrases` — and
   add the site's own. The command takes them as a function of the source's configuration.
   `extraFiles` adds files in the site's own format, such as an article record. Like the rest,
   they must depend on the verified release alone.
4. **Add the command** (from `template/intake-cli.ts`). `runIntakeCli` offers `request`,
   `receive`, `replay` and `check`, each with `--source <id>` (`check` without it covers every
   source). `request` and `receive` read `<ID>_API_BASE_URL` and `<ID>_API_TOKEN`, the source's id
   in upper case.
5. **Wire the build and the button.** Run `check` in the build. Copy `template/source-intake.yml`
   to receive an approved release from GitHub: it takes the source and the decision, runs the
   gates and pushes a branch for a person to open as a pull request.

A site whose front is not Git-published (a CMS, for instance) keeps its own importer. The
conformance kit proves that importer follows the same rules; the canonical hash is about twenty
lines in any language.

## Proving a copy behaves the same

- `conformance/` is language-neutral: any implementation runs it, whether a copy of this package
  or a port to another language (see `conformance/README.md`). It holds:
  - canonical-hash vectors;
  - 30 verification cases whose expected outcomes are written by hand.
- `test/e2e.test.ts` runs the whole command over HTTP against a local stand-in API.

## Versions

`MANIFEST.json` (`source-intake-manifest@1`) gives the sha256 of every file of the version, and
their tree digest. A shell recomputes the digest without this code:

```sh
cd <package copy>
find . -type f ! -path './MANIFEST.json' ! -path '*/node_modules/*' | sed 's#^\./##' | LC_ALL=C sort \
  | while read -r f; do printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"; done | sha256sum
```

| Version | Tree digest | What changed |
|---|---|---|
| 0.1.0 | `c0d179e2613a9fded8417e8fb6bfb503fa5ccfe53f3387aa06c151325bd3ea13` | First version (commit 8716d07), before the manifest existed. |
| 0.2.0 | `61b6ed98088acde033d6b93ebc9009ec4fed7591832b4f1bcd4a7132bb06ae03` | The command, the site kit, the rules and the templates move into the package; conformance kit; replayable proofs; the manifest. |
| 0.3.0 | in `MANIFEST.json` | One package for any source: one configuration per source (`source-intake-config@1`, with the release names), `--source` on every command, API variables named after the source, the formats renamed `source-intake-*@1`. No source's code and no product name; the script that recomputed the hash vectors with a source's code is gone. |

A version is published once its manifest is committed. After a change, bump `version` in
`package.json`, then rewrite the manifest (`tsx scripts/manifest.ts write`). A test fails on a
stale manifest. Rewriting refuses to change the tree of a version already published.
