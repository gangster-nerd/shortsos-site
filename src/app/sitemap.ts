import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/config/site-config";

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
];

// URLs end with "/" like the pages themselves (next.config trailingSlash), so no entry redirects.
// Pages carry no date rather than a fake one.
export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({ url: new URL(route === "/" ? "/" : `${route}/`, SITE_ORIGIN).toString() }));
}
