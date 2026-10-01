import type { MetadataRoute } from "next";

import { SITE_INVENTORY_AGENTS, SITE_ORIGIN } from "@/lib/config/site-config";

/** robots.txt for a given indexing state (exported so both states stay tested). */
export function robotsFor(allowsIndexing: boolean): MetadataRoute.Robots {
  // While the site is noindex, the only agents allowed are the named read-only inventory agents
  // (see SITE_INVENTORY_AGENTS). Once indexing is on, every agent is allowed and they need no
  // group of their own.
  const inventoryGroups: { userAgent: string; allow: string }[] = allowsIndexing
    ? []
    : SITE_INVENTORY_AGENTS.map((userAgent) => ({ userAgent, allow: "/" }));

  return {
    rules: [
      ...inventoryGroups,
      {
        userAgent: "*",
        // Disallow-all while the site is noindex (SITE_ALLOWS_INDEXING is false).
        disallow: allowsIndexing ? [] : "/",
        allow: allowsIndexing ? "/" : undefined,
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
