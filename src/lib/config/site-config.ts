/**
 * Single source of truth for the site's indexability. Both the robots meta tag (layout.tsx) and
 * robots.txt (app/robots.ts) read this same flag, so there is exactly one switch, not two that
 * could drift. Turned on by the owner on 2026-09-24, once every published article was reviewed
 * and cleared for public_web; the article loader refuses indexing while any article is not.
 */
export const SITE_ALLOWS_INDEXING: boolean = true;

/**
 * Read-only inventory agents the site owner explicitly lets observe the site whenever it is
 * noindex (SOS-TEXTOS-CLIENT-V1). While indexing is on, every agent is allowed and they need no
 * group of their own. ShortsOS is onboarded as a client of TextOS, whose Site
 * Intelligence crawler honours robots.txt: without a named allowance it observes nothing (checked
 * against its own robots evaluation, not assumed). The allowance lives in robots.txt only — every
 * page keeps its `noindex, nofollow` meta, every other agent stays disallowed, nothing is indexed.
 */
export const SITE_INVENTORY_AGENTS = ["TextOS-SiteIntelligence"] as const;

/** The official origin (the Vercel production address, chosen by the owner on 2026-09-24). */
export const SITE_ORIGIN = "https://shortsos-site.vercel.app" as const;
