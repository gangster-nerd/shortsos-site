import type { Metadata } from "next";

import { SITE_ALLOWS_INDEXING } from "@/lib/config/site-config";

export const metadata: Metadata = {
  title: "ShortsOS",
  description: "ShortsOS public site — placeholder scaffold pending real content (SOS-CATCHUP-V1).",
  robots: {
    // Hard default: noindex + nofollow until a human explicitly flips SITE_ALLOWS_INDEXING.
    index: SITE_ALLOWS_INDEXING,
    follow: SITE_ALLOWS_INDEXING,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
