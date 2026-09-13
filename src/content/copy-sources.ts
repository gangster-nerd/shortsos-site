/**
 * Registry of the site's own page copy, as plain text, for the copy-safety check to scan.
 * Every string a page renders as marketing/product copy should have an entry here (or be
 * pulled from here into the page) so `content:verify`-adjacent tooling and tests can catch
 * a forbidden self-serve phrase before it ships. This is intentionally small in V1 — there
 * is one placeholder home page; SOS-CATCHUP-V1 will add real copy and grow this registry.
 */
import type { CopySource } from "../lib/safety/copy-safety";

export const HOME_PAGE_COPY: CopySource = {
  id: "home-page",
  text: [
    "ShortsOS turns raw footage into published short-form video, with an operator in the loop.",
    "We are in early pilot. Reach out if you want to work with us directly.",
  ].join("\n"),
  relatedEntityIds: [],
};

export const SITE_COPY_SOURCES: CopySource[] = [HOME_PAGE_COPY];
