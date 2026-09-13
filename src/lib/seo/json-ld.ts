/**
 * Minimal schema.org JSON-LD builder. Deliberately generic (Organization) at this stage —
 * richer types (Product, Service, FAQPage) belong to SOS-CATCHUP-V1 once there is real copy
 * to describe. The point here is that the *plumbing* (a typed builder + a page that renders
 * it as a <script type="application/ld+json">) exists and is tested, not that the content is
 * final.
 */
export interface OrganizationJsonLd {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  description: string;
}

export function buildOrganizationJsonLd(params: { name: string; url: string; description: string }): OrganizationJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: params.name,
    url: params.url,
    description: params.description,
  };
}
