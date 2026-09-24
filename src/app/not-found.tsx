import type { Metadata } from "next";
import Link from "next/link";

import { NOT_FOUND_COPY } from "@/content/copy-sources";

// Exported as out/404.html, which the host serves for any unknown address. Next adds its own
// "noindex"; the robots field below replaces the layout's "index, follow", which would contradict it.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const START_HERE: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/how-it-works/", label: "How it works" },
  { href: "/proof/", label: "Proof" },
  { href: "/faq/", label: "FAQ" },
  { href: "/insights/", label: "Insights" },
];

export default function NotFound() {
  return (
    <main id="main">
      <section className="section">
        <div className="shell">
          <p className="eyebrow">{NOT_FOUND_COPY.eyebrow}</p>
          <h1>{NOT_FOUND_COPY.heading}</h1>
          <p className="lede">{NOT_FOUND_COPY.body}</p>
          <ul className="start-here">
            {START_HERE.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
