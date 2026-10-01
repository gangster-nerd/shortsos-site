/**
 * ShortsOS's part of the TextOS API intake: its configuration (`sources/textos.json`)
 * and its own rules. Everything else — the chain verification, the release layout
 * (`textos/api/<slug>/evidence.json` + `intake.json`), the command and the build re-check — is
 * the generic package, `packages/textos-intake`.
 *
 * Received releases are verified and kept; no page renders them yet.
 */
import {
  combineRules,
  forbidPhrases,
  forbidText,
  noConversion,
  onlyBlockKinds,
  readSiteConfig,
  verifyCommittedReleases,
  type ContentBlockKind,
  type SiteRules,
} from "../../../packages/textos-intake/src/index";
import { findForbiddenSelfServePhrases } from "../safety/copy-safety";

export const SHORTSOS_INTAKE_CONFIG = "sources/textos.json";

/** The ContentDocument@1 blocks a page of this site will show: TextOS's article vocabulary. */
export const RENDERABLE_BLOCK_KINDS: readonly ContentBlockKind[] = ["answer", "heading", "paragraph", "steps", "source"];

export function shortsosRules(): SiteRules {
  return {
    review: combineRules(
      onlyBlockKinds(RENDERABLE_BLOCK_KINDS, "a page of this site"),
      noConversion("the document allows conversion; this site's pages carry no commercial slot"),
      forbidPhrases(findForbiddenSelfServePhrases, (phrase) => `says "${phrase}" — ShortsOS is not self-serve (M1)`),
      forbidText(/\btextos\b/i, "names the tool it was written with; pages never do"),
    ),
  };
}

/** What `content:verify` runs: every committed release re-verified from its evidence. */
export function verifyShortsosReleases(root: string) {
  return verifyCommittedReleases(root, readSiteConfig(root, SHORTSOS_INTAKE_CONFIG), shortsosRules());
}
