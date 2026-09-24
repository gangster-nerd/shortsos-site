import { HOME_HERO } from "../../content/copy-sources";
import { FLOW_LABEL, loadInsightArticles } from "../textos/articles";

/**
 * The 1200x630 images social networks and chat apps show when a page is shared, one per
 * article and one for the rest of the site. They are rendered at build time from the words the
 * pages already carry (src/app/og/[image]/route.tsx), so an image can never say more than its page.
 */
export interface ShareImage {
  id: string;
  eyebrow: string;
  headline: string;
}

export const SITE_SHARE_IMAGE_ID = "site";

export function shareImages(): ShareImage[] {
  return [
    { id: SITE_SHARE_IMAGE_ID, eyebrow: HOME_HERO.eyebrow, headline: HOME_HERO.headline },
    ...loadInsightArticles().map((a) => ({ id: a.slug, eyebrow: `Insights · ${FLOW_LABEL[a.flow]}`, headline: a.title })),
  ];
}

export function getShareImage(id: string): ShareImage {
  const image = shareImages().find((i) => i.id === id);
  if (!image) throw new Error(`no share image ${id}`);
  return image;
}

export function shareImagePath(id: string): string {
  return `/og/${id}.png`;
}
