/**
 * ShortsOS's part of the TextOS API intake: its configuration (`textos/client/api-intake.json`)
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
  slugNotTaken,
  verifyCommittedReleases,
  type ContentBlockKind,
  type SiteRules,
} from "../../../packages/textos-intake/src/index";
import { findForbiddenSelfServePhrases } from "../safety/copy-safety";
import { readBriefs } from "./articles";

export const SHORTSOS_INTAKE_CONFIG = "textos/client/api-intake.json";

/** The ContentDocument@1 blocks a ShortsOS insights page can show: TextOS's article vocabulary. */
export const RENDERABLE_BLOCK_KINDS: readonly ContentBlockKind[] = ["answer", "heading", "paragraph", "steps", "source"];

export function shortsosRules(root: string): SiteRules {
  return {
    review: combineRules(
      slugNotTaken(() => readBriefs(root).map((brief) => brief.slug), "an insights article of this site"),
      onlyBlockKinds(RENDERABLE_BLOCK_KINDS, "an insights page"),
      noConversion("the document allows conversion; insights pages carry no commercial slot"),
      forbidPhrases(findForbiddenSelfServePhrases, (phrase) => `says "${phrase}" — ShortsOS is not self-serve (M1)`),
      forbidText(/\btextos\b/i, "names the tool it was written with; pages never do"),
    ),
  };
}

/** What `content:verify` runs: every committed release re-verified from its evidence. */
export function verifyShortsosReleases(root: string) {
  return verifyCommittedReleases(root, readSiteConfig(root, SHORTSOS_INTAKE_CONFIG), shortsosRules(root));
}
