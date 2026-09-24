import { describe, expect, it } from "vitest";

import { SHARE_IMAGE_LINE } from "../src/content/copy-sources";
import { loadSiteManifest } from "../src/lib/manifest/site-manifest";
import { checkCopySafety } from "../src/lib/safety/copy-safety";
import { pageMetadata } from "../src/lib/seo/page-metadata";
import { SITE_SHARE_IMAGE_ID, shareImagePath, shareImages } from "../src/lib/seo/share-images";
import { loadInsightArticles } from "../src/lib/textos/articles";

describe("share images", () => {
  it("exist for the site and for every published article, once each", () => {
    const ids = shareImages().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([SITE_SHARE_IMAGE_ID, ...loadInsightArticles().map((a) => a.slug)]);
  });

  it("show an article's own title, never new wording", () => {
    const articles = loadInsightArticles();
    for (const image of shareImages().filter((i) => i.id !== SITE_SHARE_IMAGE_ID)) {
      expect(image.headline).toBe(articles.find((a) => a.slug === image.id)!.title);
    }
  });

  it("pass the copy-safety check", () => {
    const { manifest } = loadSiteManifest();
    const sources = shareImages().map((i) => ({ id: `share-image:${i.id}`, text: [i.eyebrow, i.headline, SHARE_IMAGE_LINE].join("\n") }));
    expect(checkCopySafety(sources, manifest)).toEqual([]);
  });

  it("are declared by every page's metadata, the site's by default", () => {
    const site = pageMetadata({ path: "/faq/", title: "FAQ" });
    const image = { url: shareImagePath(SITE_SHARE_IMAGE_ID), width: 1200, height: 630, alt: shareImages()[0]!.headline };
    expect(site.openGraph?.images).toEqual([image]);
    expect(site.twitter).toMatchObject({ card: "summary_large_image", images: [image] });

    const slug = loadInsightArticles()[0]!.slug;
    const article = pageMetadata({ path: `/insights/${slug}/`, shareImage: slug });
    expect(article.openGraph?.images).toEqual([expect.objectContaining({ url: `/og/${slug}.png` })]);
  });
});
