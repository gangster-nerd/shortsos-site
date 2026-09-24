/**
 * Single source of truth for the site's indexability. Defaults HARD to noindex — both the
 * robots meta tag (layout.tsx) and robots.txt (app/robots.ts) read this same flag, so there
 * is exactly one switch to flip, not two that could drift. A human flips this to `true`
 * only once there is real, reviewed, non-placeholder content to show a search engine.
 */
export const SITE_ALLOWS_INDEXING = false as const;

/**
 * Read-only inventory agents the site owner explicitly lets observe the site while it is still
 * noindex (SOS-TEXTOS-CLIENT-V1). ShortsOS is onboarded as a client of TextOS, whose Site
 * Intelligence crawler honours robots.txt: without a named allowance it observes nothing (checked
 * against its own robots evaluation, not assumed). The allowance lives in robots.txt only — every
 * page keeps its `noindex, nofollow` meta, every other agent stays disallowed, nothing is indexed.
 */
export const SITE_INVENTORY_AGENTS = ["TextOS-SiteIntelligence"] as const;

export const SITE_ORIGIN = "https://shortsos-site.example" as const;
