import type { Metadata } from "next";
import Link from "next/link";

import { REQUEST_PILOT_RECEIVED_COPY } from "@/content/copy-sources";

export const metadata: Metadata = { title: "After you send a request" };

export default function RequestPilotReceivedPage() {
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Request a pilot</p>
          <h1>After you send a request</h1>
          <p className="lede">{REQUEST_PILOT_RECEIVED_COPY.lede}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>What happens next</h2>
          <p className="prose">{REQUEST_PILOT_RECEIVED_COPY.next}</p>
          <p className="prose">
            {REQUEST_PILOT_RECEIVED_COPY.failed} Back to the <Link href="/request-pilot">request form</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
