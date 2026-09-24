import type { Metadata } from "next";
import Link from "next/link";

import { HOW_IT_WORKS_INTRO, PIPELINE_NARRATIVE } from "@/content/copy-sources";
import { getM1ForSurface, splitM1Claim } from "@/lib/content/m1";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { PilotCta } from "@/components/pilot-cta";

export const metadata: Metadata = pageMetadata({ path: "/how-it-works/", title: "How it works" });

export default function HowItWorksPage() {
  const m1 = getM1ForSurface("how_it_works");
  const claim = splitM1Claim(m1.claimCeiling);

  return (
    <main id="main">
      <section className="section">
        <div className="shell">
          <p className="eyebrow">How it works</p>
          <h1>The pipeline, stage by stage</h1>
          <p className="lede">{HOW_IT_WORKS_INTRO}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="pipeline">
            {PIPELINE_NARRATIVE.map((step, i) => (
              <div key={step.title} className={`pipeline-step${step.proven ? " proven" : ""}`}>
                <div className="num">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3>
                    {step.title}{" "}
                    {step.proven ? <span className="badge badge-proven">Proven, real run</span> : <span className="badge badge-internal">Pipeline architecture</span>}
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
          <h2>The proven claim</h2>
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
            Read the full evidence on the <Link href="/proof">Proof page</Link>, or the deeper
            internal architecture on the <Link href="/methodology">Methodology page</Link>.
          </p>
        </div>
      </section>

      <PilotCta host="how_it_works" />
    </main>
  );
}
