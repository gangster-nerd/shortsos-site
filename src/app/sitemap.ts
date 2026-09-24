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

// URLs end with "/" like the pages themselves (next.config trailingSlash), so no entry redirects.
// Only articles carry a date: the one printed on them. Pages carry none rather than a fake one.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ROUTES.map((route) => ({ url: new URL(route === "/" ? "/" : `${route}/`, SITE_ORIGIN).toString() }));
  const articles = loadInsightArticles().map((a) => ({
    url: new URL(a.route, SITE_ORIGIN).toString(),
    lastModified: a.publishedOn,
  }));
  return [...pages, ...articles];
}
