/**
 * Every product commit this site cites, and where: changelog entries, TextOS briefs (source
 * groups and commit-quoting evidence) and the writer lineage of each run. `content:commits` builds
 * the public ledger from this list; `content:verify` and the tests hold the committed ledger to it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CHANGELOG_ENTRIES } from "../../content/copy-sources";
import { readBriefs } from "../textos/articles";
import type { CommitCitation } from "./commit-ledger";

export function collectProductCommitCitations(root: string): CommitCitation[] {
  const citations: CommitCitation[] = CHANGELOG_ENTRIES.filter((e) => e.repo === "shortsos").map((e) => ({
    sha: e.sha,
    citedBy: `changelog entry ${e.date} "${e.title}"`,
  }));
  for (const brief of readBriefs(root)) {
    for (const group of brief.provenance.ctcSourceGroups) {
      for (const sha of group.sourceCommits) {
        citations.push({ sha, citedBy: `brief ${brief.articleId}, source group ${group.groupId}` });
      }
    }
    for (const ev of brief.evidence) {
      if (ev.source.kind === "product_commit") {
        citations.push({ sha: ev.source.sha, citedBy: `brief ${brief.articleId}, evidence ${ev.id}` });
      }
    }
    const lineagePath = join(root, "textos", "runs", brief.articleId, "lineage.json");
    if (existsSync(lineagePath)) {
      const { canonicalProductSha } = JSON.parse(readFileSync(lineagePath, "utf8")) as { canonicalProductSha: string };
      citations.push({ sha: canonicalProductSha, citedBy: `run ${brief.articleId}, writer lineage` });
    }
  }
  return citations;
}
