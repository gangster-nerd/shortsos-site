import { HOME_HERO } from "../../content/copy-sources";

/**
 * The 1200x630 image social networks and chat apps show when a page is shared. It is rendered
 * at build time from words the pages already carry (src/app/og/[image]/route.tsx), so it can
 * never say more than the site.
 */
export interface ShareImage {
  id: string;
  eyebrow: string;
  headline: string;
}

export const SITE_SHARE_IMAGE_ID = "site";

export function shareImages(): ShareImage[] {
  return [{ id: SITE_SHARE_IMAGE_ID, eyebrow: HOME_HERO.eyebrow, headline: HOME_HERO.headline }];
}

export function getShareImage(id: string): ShareImage {
  const image = shareImages().find((i) => i.id === id);
  if (!image) throw new Error(`no share image ${id}`);
  return image;
}

export function shareImagePath(id: string): string {
  return `/og/${id}.png`;
}
