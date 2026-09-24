import type { Metadata } from "next";
import Link from "next/link";

import { REQUEST_PILOT_COPY } from "@/content/copy-sources";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = pageMetadata({ path: "/request-pilot/", title: "Request a pilot" });

const CONTACT_EMAIL = "pilots@shortsos.example";
const DEFAULT_SUBJECT = "Pilot request";
const DEFAULT_BODY =
  "Company:\nWhat you'd like to produce:\nWhere your source footage lives:\nBest way to reach you:\n";

export default function RequestPilotPage() {
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Request a pilot</p>
          <h1>Talk to the team directly</h1>
          <p className="lede">{REQUEST_PILOT_COPY.intro}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="notice">
            <strong>How this actually works:</strong> {REQUEST_PILOT_COPY.mechanism}
          </div>

          <form className="pilot-form" method="get" action={`mailto:${CONTACT_EMAIL}`}>
            <label>
              Subject
              <input type="text" name="subject" defaultValue={DEFAULT_SUBJECT} />
            </label>
            <label>
              Message
              <textarea name="body" defaultValue={DEFAULT_BODY} />
            </label>
            <button type="submit" className="btn btn-primary" style={{ justifySelf: "start" }}>
              Open email to {CONTACT_EMAIL}
            </button>
          </form>

          <p className="prose" style={{ marginTop: 24 }}>
            Prefer to write it yourself?{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(DEFAULT_SUBJECT)}`}>
              Email {CONTACT_EMAIL} directly
            </a>
            . Once you&apos;ve sent it,{" "}
            <Link href="/request-pilot/received">see what happens next</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
