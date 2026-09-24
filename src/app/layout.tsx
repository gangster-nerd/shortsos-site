import type { Metadata } from "next";

import { SITE_DESCRIPTION } from "@/content/copy-sources";
import { SITE_ALLOWS_INDEXING, SITE_ORIGIN } from "@/lib/config/site-config";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "ShortsOS",
    template: "%s — ShortsOS",
  },
  description: SITE_DESCRIPTION,
  robots: {
    // One switch for the whole site: see SITE_ALLOWS_INDEXING.
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
