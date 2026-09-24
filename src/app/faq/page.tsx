import type { Metadata } from "next";

import { FAQ_ITEMS } from "@/content/copy-sources";
import { getM1ForSurface } from "@/lib/content/m1";
import { buildFaqPageJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { PilotCta } from "@/components/pilot-cta";

export const metadata: Metadata = pageMetadata({ path: "/faq/", title: "FAQ" });

export default function FaqPage() {
  // Asserts the manifest actually authorizes M1's claim on the "faq" surface before this
  // page is allowed to ground its answers in it.
  getM1ForSurface("faq");

  const jsonLd = buildFaqPageJsonLd(FAQ_ITEMS);

  return (
    <main id="main">
      <section className="section">
        <div className="shell">
          <p className="eyebrow">FAQ</p>
          <h1>Honest answers, including the ones that are &quot;no&quot;</h1>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} className="faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <PilotCta host="faq" />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
