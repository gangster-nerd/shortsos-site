import type { MetadataRoute } from "next";

import { SITE_ALLOWS_INDEXING, SITE_INVENTORY_AGENTS, SITE_ORIGIN } from "@/lib/config/site-config";

// Required for `output: "export"` — this route has no request-time dependency, so it can
// (and must) be emitted as a fixed static file rather than a server route.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  // While the site is noindex, the only agents allowed are the named read-only inventory agents
  // (see SITE_INVENTORY_AGENTS). Once indexing is on, every agent is allowed and they need no
  // group of their own.
  const inventoryGroups: { userAgent: string; allow: string }[] = SITE_ALLOWS_INDEXING
    ? []
    : SITE_INVENTORY_AGENTS.map((userAgent) => ({ userAgent, allow: "/" }));

  return {
    rules: [
      ...inventoryGroups,
      {
        userAgent: "*",
        // Hard default: disallow-all until a human flips SITE_ALLOWS_INDEXING to true.
        disallow: SITE_ALLOWS_INDEXING ? [] : "/",
        allow: SITE_ALLOWS_INDEXING ? "/" : undefined,
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
