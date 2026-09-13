import type { Metadata } from "next";

import { SITE_ALLOWS_INDEXING } from "@/lib/config/site-config";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ShortsOS",
    template: "%s — ShortsOS",
  },
  description:
    "ShortsOS turns raw footage into a reviewed, published short — with a real, proven " +
    "Produce → Review → Publish run behind it, operated by the ShortsOS team for pilots.",
  robots: {
    // Hard default: noindex + nofollow until a human explicitly flips SITE_ALLOWS_INDEXING.
    index: SITE_ALLOWS_INDEXING,
    follow: SITE_ALLOWS_INDEXING,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
