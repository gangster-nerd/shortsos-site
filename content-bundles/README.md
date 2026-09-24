# content-bundles/

Output of `npm run content:sync`, and the pinned inputs `npm run content:verify` re-derives
from. Everything here is committed — this is version-controlled derived state, not a build
artifact excluded by `.gitignore`.

## Layout

- `bundle.json` — the deterministic `ContentBundle` (see `src/lib/commit-to-content/schema.ts`)
  produced by the last sync. Pure function of its inputs: no timestamp, no environment data.
- `pin.json` — human-facing sync status: pinned product ref, manifest checksum, wall-clock
  `syncedAt`, and the previous product ref. NOT part of the deterministic bundle — this is the
  one place a timestamp is allowed to live, and `content:status` reads it.
- `inputs/` — the exact inputs the last sync consumed, committed verbatim so
  `content:verify` can re-derive `bundle.json` and `content/candidates/**` with **zero**
  product-repo access and **zero** network calls:
  - `inputs/manifest.json` + `inputs/manifest.json.sha256` — the product repo's
    `.artifacts/public-product-manifest.json` artifact and its checksum sidecar, copied
    byte-for-byte.
  - `inputs/impact-records/*.json` — the product repo's
    `changes/content-impact/records/*.json` files, copied byte-for-byte.
  - `inputs/pin.json` — just `{ "productRef": "<sha>" }`, the deterministic half of the pin
    (kept separate from the human-facing `pin.json` above specifically so it carries no
    timestamp and `content:verify` never needs one).
  - `inputs/product-commits.json` — the commit ledger (`npm run content:commits`, SOS-NOTES-V1):
    the product commits this site cites (changelog entries, TextOS briefs and their runs), plus
    the pinned tip, each with author date and subject only. `content:commits` resolves every
    citation with `git` and refuses any commit that is not in the history of the pinned ref.
    This repository is public and the product repository is not, so the ledger carries no
    uncited commit, no changed path and no commit body. `content:verify` fails if it is not in
    canonical form, not written from the same ref as the manifest pin, or not exactly the set of
    commits the site cites. Run it after `content:sync`, against the same checkout, and again
    whenever a citation is added. It refuses a shallow clone, where real commits would look
    unreachable.

`../content/candidates/*.json` (one file per manifest entity currently at
`derivedPublicationStatus === "candidate"`) is the sibling committed output — see that
directory.

## Disclosed V1 simplification (not a hidden shortcut)

`content:sync` obtains the product manifest by requiring the product repo at
`--product-repo-path` (default `../shortsos`) to **already be checked out** with its `HEAD`
at exactly `--product-ref`. It verifies this with a read-only `git rev-parse HEAD` and
refuses (with the exact `git checkout` command to run) if it doesn't match — it never
checks out, fetches, merges, or commits anything in that repo. If the manifest artifact is
missing there, it runs `npm run public-truth:build` in place (a local, no-network build that
writes into that repo's git-ignored `.artifacts/`, not a commit).

This is deliberately narrower than "sync against an arbitrary product ref on demand." A real
cross-repo sync would need either a published, versioned manifest artifact (once the product
repo has an export/CI step — it doesn't yet, see `product-manifest/IMPORT.md`) or pinning a
specific commit's tree without disturbing the operator's working checkout (e.g. a `git
worktree`). The latter was prototyped during development and confirmed to work (a real
`public-truth:build` run against product-repo commit `642d72fa376908f0f24fadf0313c9c6de1c8273b`
produced a 42-entity manifest matching this repo's schema exactly), but was deliberately left
out of the shipped tool: an ephemeral worktree that isn't cleaned up because the process died
mid-run leaves the product repo's own `.git/worktrees` mutated, which is exactly the kind of
footprint "read-only against that repo" is meant to rule out. The HEAD-match-or-refuse design
has zero failure mode that touches the product repo's git state, at the cost of requiring a
human (or a future CI step with its own checkout) to put that repo on the right ref first.

No LLM call, no network call anywhere in this tooling beyond what `public-truth:build` itself
might one day need (none, today).
