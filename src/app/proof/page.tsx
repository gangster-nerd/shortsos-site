import type { Metadata } from "next";

import { PROOF_INTRO, PROOF_WHAT_HAPPENED, PROOF_WHAT_THIS_IS_NOT } from "@/content/copy-sources";
import { getM1ForSurface, splitM1Claim } from "@/lib/content/m1";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { PilotCta } from "@/components/pilot-cta";

export const metadata: Metadata = pageMetadata({ path: "/proof/", title: "Proof" });

export default function ProofPage() {
  const m1 = getM1ForSurface("proof");
  const claim = splitM1Claim(m1.claimCeiling);

  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Proof</p>
          <h1>One real, end-to-end run — not a demo</h1>
          <p className="lede">{PROOF_INTRO}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>The claim, exactly as ratified</h2>
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
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>What happened</h2>
          <p className="prose">{PROOF_WHAT_HAPPENED}</p>
          <h3 style={{ marginTop: 28 }}>What this is not</h3>
          <p className="prose">{PROOF_WHAT_THIS_IS_NOT}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>Known limits</h2>
          <ul className="no-list">
            {m1.knownLimits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2>Never claimed</h2>
          <p className="prose">
            The following are explicitly out of bounds for this claim, by ratified governance
            decision — not just informal caution:
          </p>
          <ul className="no-list">
            {m1.prohibitedClaims.map((claimText) => (
              <li key={claimText}>{claimText}</li>
            ))}
          </ul>
          <p className="prose" style={{ marginTop: 20 }}>
            Governance record: <code>{m1.publicationDecision}</code> (in the ShortsOS product
            repository).
          </p>
        </div>
      </section>

      <PilotCta host="proof" />
    </main>
  );
}
