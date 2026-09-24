import Link from "next/link";

import { PILOT_CTA_COPY } from "@/content/copy-sources";
import { getM1ForSurface } from "@/lib/content/m1";
import type { Surface } from "@/lib/manifest/schema";
import { CTA_REGISTRY } from "@/lib/registries/cta-registry";

/**
 * The end-of-page pilot CTA. Its copy speaks to M1's commercial motion, so the manifest must
 * authorize M1 both on the `cta` surface and on the page hosting the block; a page outside
 * M1's allowed surfaces (Methodology, Insights) cannot carry it. Renders nothing while the
 * `request_pilot` CTA is switched off.
 */
export function PilotCta({ host }: { host: Surface }) {
  const requestPilot = CTA_REGISTRY.request_pilot;
  if (!requestPilot.enabled) return null;
  getM1ForSurface("cta");
  getM1ForSurface(host);

  return (
    <section className="section cta-band" aria-labelledby="pilot-cta-heading">
      <div className="shell">
        <p className="eyebrow">{PILOT_CTA_COPY.eyebrow}</p>
        <h2 id="pilot-cta-heading">{PILOT_CTA_COPY.heading}</h2>
        <p className="lede">{PILOT_CTA_COPY.body}</p>
        <div className="cta-band-action">
          <Link href={requestPilot.href} className="btn btn-primary">
            {requestPilot.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
