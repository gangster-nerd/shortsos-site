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

/**
 * Article / TechArticle JSON-LD for `/insights/<slug>/` (SOS-NOTES-V1). Mirrors only what the page
 * visibly shows: headline, description, language, the publication date printed on the page, and
 * the organization as author and publisher, and the page's canonical URL on the official origin.
 */
export interface ArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "Article" | "TechArticle";
  headline: string;
  description: string;
  inLanguage: string;
  datePublished: string;
  author: { "@type": "Organization"; name: string };
  publisher: { "@type": "Organization"; name: string };
  url: string;
  mainEntityOfPage: { "@type": "WebPage"; "@id": string };
}

export function buildArticleJsonLd(params: {
  schemaType: string;
  headline: string;
  description: string;
  inLanguage: string;
  datePublished: string;
  url: string;
}): ArticleJsonLd {
  const type = params.schemaType === "TechArticle" ? "TechArticle" : "Article";
  return {
    "@context": "https://schema.org",
    "@type": type,
    headline: params.headline,
    description: params.description,
    inLanguage: params.inLanguage,
    datePublished: params.datePublished,
    author: { "@type": "Organization", name: "ShortsOS" },
    publisher: { "@type": "Organization", name: "ShortsOS" },
    url: params.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": params.url },
  };
}

/** CollectionPage JSON-LD for the `/insights/` index — one part per listed article. */
export interface CollectionPageJsonLd {
  "@context": "https://schema.org";
  "@type": "CollectionPage";
  name: string;
  description: string;
  hasPart: { "@type": "Article" | "TechArticle"; headline: string; datePublished: string }[];
}

export function buildCollectionPageJsonLd(params: {
  name: string;
  description: string;
  parts: { schemaType: string; headline: string; datePublished: string }[];
}): CollectionPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: params.name,
    description: params.description,
    hasPart: params.parts.map((p) => ({
      "@type": p.schemaType === "TechArticle" ? "TechArticle" : "Article",
      headline: p.headline,
      datePublished: p.datePublished,
    })),
  };
}
