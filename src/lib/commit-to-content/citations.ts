/**
 * Every product commit this site cites: its changelog entries. `content:commits` builds the
 * public ledger from this list; `content:verify` and the tests hold the committed ledger to it.
 */
import { CHANGELOG_ENTRIES } from "../../content/copy-sources";
import type { CommitCitation } from "./commit-ledger";

export function collectProductCommitCitations(): CommitCitation[] {
  return CHANGELOG_ENTRIES.filter((e) => e.repo === "shortsos").map((e) => ({
    sha: e.sha,
    citedBy: `changelog entry ${e.date} "${e.title}"`,
  }));
}
