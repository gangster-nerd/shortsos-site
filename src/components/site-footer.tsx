import Link from "next/link";

import { requestPilotLink } from "@/lib/registries/cta-registry";

export function SiteFooter() {
  const requestPilot = requestPilotLink("footer");
  return (
    <footer className="footer">
      <div className="shell footer-row">
        <div>
          <div>ShortsOS</div>
          <div style={{ marginTop: 4 }}>
            Operator-run video production. This site is not indexed and is currently for direct pilot
            conversations only.
          </div>
        </div>
        <nav className="footer-links">
          <Link href="/insights">Insights</Link>
          <Link href="/glossary">Glossary</Link>
          <Link href="/changelog">Changelog</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/privacy">Privacy</Link>
          {requestPilot ? <Link href={requestPilot.href}>{requestPilot.label}</Link> : null}
        </nav>
      </div>
    </footer>
  );
}
