import { describe, expect, it } from "vitest";

import { HOME_HERO, SHARE_IMAGE_LINE } from "../src/content/copy-sources";
import { loadSiteManifest } from "../src/lib/manifest/site-manifest";
import { checkCopySafety } from "../src/lib/safety/copy-safety";
import { pageMetadata } from "../src/lib/seo/page-metadata";
import { SITE_SHARE_IMAGE_ID, shareImagePath, shareImages } from "../src/lib/seo/share-images";

describe("share images", () => {
  it("are the site's own, in the home page's words", () => {
    expect(shareImages()).toEqual([{ id: SITE_SHARE_IMAGE_ID, eyebrow: HOME_HERO.eyebrow, headline: HOME_HERO.headline }]);
  });

  it("pass the copy-safety check", () => {
    const { manifest } = loadSiteManifest();
    const sources = shareImages().map((i) => ({ id: `share-image:${i.id}`, text: [i.eyebrow, i.headline, SHARE_IMAGE_LINE].join("\n") }));
    expect(checkCopySafety(sources, manifest)).toEqual([]);
  });

  it("are declared by every page's metadata", () => {
    const site = pageMetadata({ path: "/faq/", title: "FAQ" });
    const image = { url: shareImagePath(SITE_SHARE_IMAGE_ID), width: 1200, height: 630, alt: HOME_HERO.headline };
    expect(site.openGraph?.images).toEqual([image]);
    expect(site.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
  });
});
