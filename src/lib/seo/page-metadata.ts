import type { Metadata } from "next";

import { SITE_DESCRIPTION } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";
import { SITE_SHARE_IMAGE_ID, getShareImage, shareImagePath } from "@/lib/seo/share-images";

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
  /** The share image to show (an article's slug); the site's own by default. */
  shareImage?: string;
}): Metadata {
  const url = new URL(params.path, SITE_ORIGIN).toString();
  const description = params.description ?? SITE_DESCRIPTION;
  const share = getShareImage(params.shareImage ?? SITE_SHARE_IMAGE_ID);
  const image = { url: shareImagePath(share.id), width: 1200, height: 630, alt: share.headline };
  const title = params.title ? `${params.title} — ShortsOS` : "ShortsOS";
  return {
    ...(params.title ? { title: params.title } : {}),
    ...(params.description ? { description: params.description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: params.type ?? "website",
      url,
      siteName: "ShortsOS",
      title,
      description,
      locale: "en_US",
      images: [image],
      ...(params.publishedTime ? { publishedTime: params.publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
