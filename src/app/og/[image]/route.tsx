import { ImageResponse } from "next/og";

import { SHARE_IMAGE_LINE } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";
import { getShareImage, shareImages } from "@/lib/seo/share-images";

// Rendered once at build time into out/og/<id>.png, like llms.txt: no request-time dependency.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return shareImages().map((image) => ({ image: `${image.id}.png` }));
}

// The site's light palette (src/app/globals.css). Next's bundled font is used: no network at build.
const COLOR = {
  bg: "#faf9f6",
  ink: "#14140f",
  soft: "#4a4a42",
  faint: "#6a6a5f",
  line: "#e4e2da",
  accent: "#ac5b2e",
  accentInk: "#fdf8f3",
};

export async function GET(_request: Request, { params }: { params: Promise<{ image: string }> }) {
  const { image } = await params;
  const share = getShareImage(image.replace(/\.png$/, ""));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: COLOR.bg }}>
        <div style={{ width: 16, height: "100%", background: COLOR.accent }} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px 80px 52px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                background: COLOR.accent,
                color: COLOR.accentInk,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 42,
              }}
            >
              S
            </div>
            <div style={{ fontSize: 36, color: COLOR.ink }}>ShortsOS</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: COLOR.faint }}>
              {share.eyebrow}
            </div>
            <div style={{ fontSize: share.headline.length > 64 ? 52 : 62, lineHeight: 1.15, color: COLOR.ink }}>
              {share.headline}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${COLOR.line}`,
              paddingTop: 24,
              fontSize: 24,
              color: COLOR.soft,
            }}
          >
            <div>{SHARE_IMAGE_LINE}</div>
            <div style={{ color: COLOR.faint }}>{new URL(SITE_ORIGIN).host}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
