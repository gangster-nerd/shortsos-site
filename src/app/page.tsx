import { CTA_REGISTRY } from "@/lib/registries/cta-registry";
import { buildOrganizationJsonLd } from "@/lib/seo/json-ld";
import { HOME_PAGE_COPY } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";

export default function HomePage() {
  const requestPilot = CTA_REGISTRY.request_pilot;
  const jsonLd = buildOrganizationJsonLd({
    name: "ShortsOS",
    url: SITE_ORIGIN,
    description: "Placeholder — real copy pending SOS-CATCHUP-V1.",
  });

  return (
    <main>
      <h1>ShortsOS</h1>
      {HOME_PAGE_COPY.text.split("\n").map((line) => (
        <p key={line}>{line}</p>
      ))}
      {requestPilot.enabled ? <a href={requestPilot.href}>{requestPilot.label}</a> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
