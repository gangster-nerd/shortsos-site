import type { Metadata } from "next";
import Link from "next/link";

import { CTA_REGISTRY } from "@/lib/registries/cta-registry";
import { buildOrganizationJsonLd } from "@/lib/seo/json-ld";
import { HOME_INTRO, PIPELINE_NARRATIVE } from "@/content/copy-sources";
import { getM1ForSurface, splitM1Claim } from "@/lib/content/m1";
import { SITE_ORIGIN } from "@/lib/config/site-config";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = pageMetadata({ path: "/" });

export default function HomePage() {
  const requestPilot = CTA_REGISTRY.request_pilot;
  const m1 = getM1ForSurface("homepage");
  const claim = splitM1Claim(m1.claimCeiling);

  const jsonLd = buildOrganizationJsonLd({
    name: "ShortsOS",
    url: SITE_ORIGIN,
    description:
      "ShortsOS: operator-run production of short-form video from a client's own raw footage, with a proven Produce → Review → Publish workflow.",
  });

  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Video production, evidence-first</p>
          <h1>From raw footage to a published, reviewed short.</h1>
          <p className="lede">{HOME_INTRO}</p>
          {requestPilot.enabled ? (
            <div style={{ marginTop: 28 }}>
              <Link href={requestPilot.href} className="btn btn-primary">
                {requestPilot.label}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <p className="eyebrow">The pipeline</p>
          <h2>What actually happens to a client&apos;s footage</h2>
          <div className="pipeline">
            {PIPELINE_NARRATIVE.map((step, i) => (
              <div key={step.title} className={`pipeline-step${step.proven ? " proven" : ""}`}>
                <div className="num">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3>
                    {step.title}{" "}
                    {step.proven ? <span className="badge badge-proven">Proven, real run</span> : null}
                  </h3>
                  <p>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <p className="eyebrow">What&apos;s proven</p>
          <h2>The one thing we can show, not just describe</h2>
          <div className="claim-block">
            <div className="claim-row">
              <div className="claim-label">Proven fact</div>
              <p className="claim-fact">{claim.provenFact}</p>
            </div>
            <div className="claim-row">
              <div className="claim-label">For pilots</div>
              <p className="claim-motion">{claim.commercialMotion}</p>
            </div>
          </div>
          <p className="prose">
            <Link href="/proof">See the full proof →</Link>
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
