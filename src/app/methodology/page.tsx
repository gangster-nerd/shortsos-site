import type { Metadata } from "next";
import Link from "next/link";

import { METHODOLOGY_INTRO, METHODOLOGY_STATUS_NOTE, METHODOLOGY_STAGES } from "@/content/copy-sources";
import { loadSiteManifest } from "@/lib/manifest/site-manifest";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = pageMetadata({ path: "/methodology/", title: "Methodology" });

export default function MethodologyPage() {
  const { manifest } = loadSiteManifest();

  return (
    <main id="main">
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Methodology</p>
          <h1>How the pipeline is built, internally</h1>
          <p className="lede">{METHODOLOGY_INTRO}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>Internal architecture</h2>
          <div className="grid grid-2" style={{ marginTop: 24 }}>
            {METHODOLOGY_STAGES.map((stage) => (
              <div key={stage.name} className="card">
                <h3>{stage.name}</h3>
                <p>{stage.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>What this program actually claims publicly</h2>
          <p className="prose">{METHODOLOGY_STATUS_NOTE}</p>
          <table className="kv">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>public_marketable</td>
                <td>{manifest.counts.public_marketable}</td>
                <td>Cleared for a public claim — see the <Link href="/proof">Proof page</Link>.</td>
              </tr>
              <tr>
                <td>candidate</td>
                <td>{manifest.counts.candidate}</td>
                <td>Real, implemented, internally reviewed — not yet ratified for a public claim.</td>
              </tr>
              <tr>
                <td>internal_only</td>
                <td>{manifest.counts.internal_only}</td>
                <td>Internal engineering, no public claim of any kind.</td>
              </tr>
              <tr>
                <td>blocked</td>
                <td>{manifest.counts.blocked}</td>
                <td>Explicitly prohibited from ever being claimed publicly.</td>
              </tr>
            </tbody>
          </table>
          <p className="prose" style={{ marginTop: 20 }}>
            Nothing in the candidate or internal_only rows above is available to a visitor of this
            site today — they describe internal engineering behind the one proven, publicly claimed
            capability, not additional features you can use.
          </p>
        </div>
      </section>
    </main>
  );
}
