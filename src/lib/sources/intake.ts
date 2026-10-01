/**
 * ShortsOS's part of the source intake: where its sources are configured (`sources/<id>.json`)
 * and the rules a release must also meet on this site. Everything else — the chain verification,
 * the release layout, the command and the build re-check — is the generic package,
 * `packages/source-intake`.
 *
 * Content reaches this site from a source through that source's API, and no other way
 * (AGENTS.md). Received releases are verified and kept; no page renders them yet.
 */
import {
  combineRules,
  forbidPhrases,
  forbidText,
  noConversion,
  onlyBlockKinds,
  readSourceConfigs,
  verifyCommittedReleases,
  type ContentBlockKind,
  type ReceivedRelease,
  type SiteRules,
  type SourceIntakeConfig,
} from "../../../packages/source-intake/src/index";
import { findForbiddenSelfServePhrases } from "../safety/copy-safety";

export const SOURCES_DIR = "sources";

/** The ContentDocument@1 blocks a page of this site will show. */
export const RENDERABLE_BLOCK_KINDS: readonly ContentBlockKind[] = ["answer", "heading", "paragraph", "steps", "source"];

/** The rules a release from `config.source` must also meet on this site. */
export function siteRules(config: SourceIntakeConfig): SiteRules {
  return {
    review: combineRules(
      onlyBlockKinds(RENDERABLE_BLOCK_KINDS, "a page of this site"),
      noConversion("the document allows conversion; this site's pages carry no commercial slot"),
      forbidPhrases(findForbiddenSelfServePhrases, (phrase) => `says "${phrase}" — ShortsOS is not self-serve (M1)`),
      // A source id is letters and digits only, so it is a safe pattern as is.
      forbidText(new RegExp(`\\b${config.source}\\b`, "i"), `names ${config.source}, the source it was released by; pages never do`),
    ),
  };
}

/** What `content:verify` runs: every committed release of every source, re-verified from its evidence. */
export function verifyReceivedReleases(root: string): { releases: ReceivedRelease[]; problems: string[] } {
  const releases: ReceivedRelease[] = [];
  const problems: string[] = [];
  for (const config of readSourceConfigs(root, SOURCES_DIR)) {
    const checked = verifyCommittedReleases(root, config, siteRules(config));
    releases.push(...checked.releases);
    problems.push(...checked.problems);
  }
  return { releases, problems };
}
