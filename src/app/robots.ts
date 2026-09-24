import type { MetadataRoute } from "next";

import { SITE_ALLOWS_INDEXING } from "@/lib/config/site-config";
import { robotsFor } from "@/lib/seo/robots";

// Required for `output: "export"` — this route has no request-time dependency, so it can
// (and must) be emitted as a fixed static file rather than a server route.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return robotsFor(SITE_ALLOWS_INDEXING);
}
