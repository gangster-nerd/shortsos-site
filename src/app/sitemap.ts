import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/config/site-config";

// Required for `output: "export"` — this route has no request-time dependency, so it can
// (and must) be emitted as a fixed static file rather than a server route.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_ORIGIN,
      lastModified: new Date(0),
    },
  ];
}
