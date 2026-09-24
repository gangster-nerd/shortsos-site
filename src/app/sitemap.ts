import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/config/site-config";
import { loadInsightArticles } from "@/lib/textos/articles";

// Required for `output: "export"` — this route has no request-time dependency, so it can
// (and must) be emitted as a fixed static file rather than a server route.
export const dynamic = "force-static";

const ROUTES = [
  "/",
  "/how-it-works",
  "/methodology",
  "/proof",
  "/faq",
  "/changelog",
  "/glossary",
  "/request-pilot",
  "/request-pilot/received",
  "/insights",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const articleRoutes = loadInsightArticles().map((a) => a.route.replace(/\/$/, ""));
  return [...ROUTES, ...articleRoutes].map((route) => ({
    url: `${SITE_ORIGIN}${route}`,
    lastModified: new Date(0),
  }));
}
