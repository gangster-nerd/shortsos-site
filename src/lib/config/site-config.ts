/**
 * Single source of truth for the site's indexability. Defaults HARD to noindex — both the
 * robots meta tag (layout.tsx) and robots.txt (app/robots.ts) read this same flag, so there
 * is exactly one switch to flip, not two that could drift. A human flips this to `true`
 * only once there is real, reviewed, non-placeholder content to show a search engine.
 */
export const SITE_ALLOWS_INDEXING = false as const;

export const SITE_ORIGIN = "https://shortsos-site.example" as const;
