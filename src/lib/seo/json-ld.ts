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

/**
 * FAQPage JSON-LD — extends the existing minimal builder pattern above rather than
 * introducing a second JSON-LD approach. Built directly from the site's own FAQ copy
 * (`src/content/copy-sources.ts`'s `FAQ_ITEMS`), never independently authored, so the
 * structured data can never drift from what the page actually renders.
 */
export interface FaqPageJsonLd {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: {
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }[];
}

export function buildFaqPageJsonLd(items: { q: string; a: string }[]): FaqPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
