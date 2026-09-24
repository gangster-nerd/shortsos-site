import Link from "next/link";

import { CTA_REGISTRY } from "@/lib/registries/cta-registry";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/methodology", label: "Methodology" },
  { href: "/proof", label: "Proof" },
  { href: "/faq", label: "FAQ" },
  { href: "/insights", label: "Insights" },
  { href: "/changelog", label: "Changelog" },
];

export function SiteNav() {
  const requestPilot = CTA_REGISTRY.request_pilot;
  return (
    <header className="nav">
      <div className="shell nav-row">
        <Link href="/" className="brand">
          ShortsOS
        </Link>
        <nav className="nav-links">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        {requestPilot.enabled ? (
          <Link href={requestPilot.href} className="btn btn-primary nav-cta">
            {requestPilot.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
