import type { MetadataRoute } from "next";

import { SITE_ALLOWS_INDEXING, SITE_ORIGIN } from "@/lib/config/site-config";

// Required for `output: "export"` — this route has no request-time dependency, so it can
// (and must) be emitted as a fixed static file rather than a server route.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Hard default: disallow-all until a human flips SITE_ALLOWS_INDEXING to true.
      disallow: SITE_ALLOWS_INDEXING ? [] : "/",
      allow: SITE_ALLOWS_INDEXING ? "/" : undefined,
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
