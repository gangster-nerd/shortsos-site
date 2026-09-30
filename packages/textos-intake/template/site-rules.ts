/**
 * TEMPLATE — a site's own rules. Copy next to the site's code, change the import below to where
 * the package lives in the site, keep the checks that match what its pages can show, and add its
 * own (its copy rules, the slugs it already uses). They run after the chain verified; any
 * violation refuses the release.
 */
import { combineRules, noConversion, onlyBlockKinds, slugNotTaken, type SiteRules } from "../src/index";

export function siteRules(options: { takenSlugs: () => Iterable<string> }): SiteRules {
  return {
    review: combineRules(
      // A slug the site already uses would collide with an existing page.
      slugNotTaken(options.takenSlugs),
      // Only the blocks the site's article pages render; a TextOS Article Review uses these.
      onlyBlockKinds(["answer", "heading", "paragraph", "steps", "source"]),
      // No commercial slot unless the site decides a release may carry one.
      noConversion(),
    ),
  };
}
