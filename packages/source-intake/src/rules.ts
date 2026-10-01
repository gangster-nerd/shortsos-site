/**
 * Building blocks for a site's own rules — what a release must also meet on THIS site once its
 * chain verified. Each returns the violations it finds; `combineRules` runs them all, and any
 * violation refuses the release. A site composes the few it needs and adds its own.
 */
import { readableText, type ContentBlockKind } from "./delivery";
import type { VerifiedDelivery } from "./verify";

export type ReleaseRule = (verified: VerifiedDelivery) => string[];

export function combineRules(...rules: ReleaseRule[]): ReleaseRule {
  return (verified) => rules.flatMap((rule) => rule(verified));
}

/** Only the blocks the site's pages can show. */
export function onlyBlockKinds(kinds: readonly ContentBlockKind[], where = "this site"): ReleaseRule {
  return (verified) =>
    verified.delivery.contentDocument.body
      .filter((block) => !kinds.includes(block.kind))
      .map((block) => `block ${block.id} is a ${block.kind}, which ${where} does not show`);
}

/** No commercial slot: a document that allows conversion is refused. */
export function noConversion(message = "the document allows conversion; this site shows no commercial slot"): ReleaseRule {
  return (verified) => {
    const conversion = verified.delivery.contentDocument.conversion as { conversionAllowed?: unknown } | undefined;
    return conversion?.conversionAllowed === true ? [message] : [];
  };
}

/** A slug the site already uses is refused. `taken` is read on every call. */
export function slugNotTaken(taken: () => Iterable<string>, what = "a page of this site"): ReleaseRule {
  return (verified) => {
    const slug = verified.delivery.contentDocument.identity.slug;
    return [...taken()].includes(slug) ? [`slug ${slug} is already ${what}`] : [];
  };
}

/** One violation when any text a reader would see matches `pattern`. */
export function forbidText(pattern: RegExp, message: string): ReleaseRule {
  const once = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
  return (verified) => (readableText(verified.delivery.contentDocument).some((text) => once.test(text)) ? [message] : []);
}

/** One violation per phrase a site's own finder reports in the text a reader would see. */
export function forbidPhrases(find: (text: string) => { phrase: string }[], explain: (phrase: string) => string): ReleaseRule {
  return (verified) => find(readableText(verified.delivery.contentDocument).join("\n")).map((hit) => explain(hit.phrase));
}
