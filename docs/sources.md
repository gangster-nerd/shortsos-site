# Sources

How content from another product reaches this site. There is one path: the product's API,
through the door in `packages/source-intake` ([AGENTS.md](../AGENTS.md)).

## The door

- **One configuration per source**: `sources/<id>.json` (`source-intake-config@1`). It holds what
  the site accepts from that source: its workspace, the release names it uses, the languages the
  site publishes, the content schema the site renders, and the folder releases land in.
- **The site's rules**: `src/lib/sources/intake.ts`. Every release must also pass them:
  - only blocks a page of this site can show;
  - no conversion slot;
  - no self-serve wording (M1);
  - no page naming the source it was released by.
- **The command**: `npm run intake -- <request | receive | replay | check> --source <id>`.
  `request` and `receive` read the source's API from `<ID>_API_BASE_URL` and `<ID>_API_TOKEN`,
  the id in upper case.
- **The button**: `.github/workflows/source-intake.yml` takes the source and the approved
  decision. It receives the release, runs every gate CI runs, and pushes a branch. A person opens
  the pull request and merges it.
- **The build**: `content:verify` re-verifies every committed release of every source from its
  stored evidence, with no network and no token.

Received releases are verified and kept. No page renders them yet.

## Configured sources

### TextOS (`sources/textos.json`)

- **Status:** nothing can be received yet; see [api-gaps.md](api-gaps.md). No workspace is
  assigned, and the release capability the site asks for is a proposal.
- **Releases land in:** `content/releases/textos/<slug>/`.
- **Language:** the site accepts `en-US` releases. A French release is refused until the French
  pages ship.
- **Hash vectors:** `packages/source-intake/conformance/canonical-vectors.json` was computed on
  2026-10-01 with TextOS's own canonical hashing (`packages/api-foundation/src/integrity/canonical.ts`
  at a38a16a), from a read-only checkout. The script that did it was removed with the rest of the
  local path. The vectors now stand as the protocol's.

## The same door in other sites

`packages/source-intake` is written to be copied, byte for byte, into any Git-published site. Its
README gives the steps, and its conformance kit proves a copy or a port behaves the same.

- **RepOS-site.**
  - It publishes `fr-FR`, the only language the API writes today.
  - Its releases would land under their own folder, and its rules' `extraFiles` would also write
    the article record `content/articles/<slug>.json` (`repos-site.article-record@1`), with
    `document` set to the delivered ContentDocument and `publication` left `draft`.
  - RepOS's gate 2 still decides publication, and its build gates (CONTENT_PASS, FIDELITY_PASS,
    confidentiality) keep applying.
  - Its lineage schema knows two flows, `commit-to-content` and `site-intelligence`. An API
    release is a third flow, which RepOS would add. The delivery's `statementLedger` maps onto
    its statements, so FIDELITY_PASS would compare against the ledger.
- **textos-site.**
  - Its toolchain already fits: a static Next.js export, TypeScript `bundler` resolution, tsx,
    vitest, Node 22.
  - It publishes in `en`, while the API writes `fr-FR` only (gap G4).
  - Adopting the door there is the TextOS team's work: ShortsOS never modifies TextOS
    repositories.
- **Les Jardiniers.**
  - TextOS releases its content to WordPress today, as governed drafts with their own trust path.
    The door does not replace that.
  - A Git-published front would adopt the door like the sites above, with its own `siteId`.
  - A WordPress front keeps its own importer. The conformance kit proves that importer follows
    the same rules.
