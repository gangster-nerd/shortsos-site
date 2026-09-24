import type { Metadata } from "next";

import { SITE_DESCRIPTION } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";

/**
 * Per-page metadata: the title, the page's canonical URL on the official origin, and Open Graph
 * fields that match what the page says. A page's `openGraph` replaces the layout's, so every field
 * is set here rather than inherited.
 */
export function pageMetadata(params: {
  path: string;
  title?: string;
  description?: string;
  type?: "website" | "article";
  publishedTime?: string;
}): Metadata {
  const url = new URL(params.path, SITE_ORIGIN).toString();
  const description = params.description ?? SITE_DESCRIPTION;
  return {
    ...(params.title ? { title: params.title } : {}),
    ...(params.description ? { description: params.description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: params.type ?? "website",
      url,
      siteName: "ShortsOS",
      title: params.title ? `${params.title} — ShortsOS` : "ShortsOS",
      description,
      locale: "en_US",
      ...(params.publishedTime ? { publishedTime: params.publishedTime } : {}),
    },
    twitter: { card: "summary", title: params.title ? `${params.title} — ShortsOS` : "ShortsOS", description },
  };
}
