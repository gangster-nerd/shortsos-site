import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "After you email us" };

export default function RequestPilotReceivedPage() {
  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Request a pilot</p>
          <h1>Thanks for reaching out</h1>
          <p className="lede">
            This page confirms what happens next — it is not a submission receipt. This site has no
            server or database behind it, so it has no way to confirm an email actually reached us;
            that confirmation lives in your own email client&apos;s sent folder, not here.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>What happens next</h2>
          <p className="prose">
            If you emailed us from the <Link href="/request-pilot">Request a pilot</Link> page, someone
            from the ShortsOS team will reply directly to that email, usually within a few business
            days.
          </p>
          <p className="prose">
            If you don&apos;t hear back, check your sent folder to confirm the email actually went out,
            and feel free to send it again — there is no automated queue or ticketing system on our
            side that could silently drop it, but there is also no automated acknowledgment.
          </p>
        </div>
      </section>
    </main>
  );
}
