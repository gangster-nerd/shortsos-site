import type { Metadata } from "next";
import Link from "next/link";

import { INSIGHTS_INTRO } from "@/content/copy-sources";
import { buildCollectionPageJsonLd } from "@/lib/seo/json-ld";
import { loadInsightArticles, type InsightArticle } from "@/lib/textos/articles";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata: Metadata = pageMetadata({ path: "/insights/", title: "Insights" });

const SECTIONS: { flow: InsightArticle["flow"]; eyebrow: string; title: string }[] = [
  { flow: "site_intelligence", eyebrow: "Answers", title: "Questions this site now answers in depth" },
  { flow: "commit_to_content", eyebrow: "Engineering notes", title: "Written from the product's commits" },
];

export default function InsightsIndexPage() {
  const articles = loadInsightArticles();
  const jsonLd = buildCollectionPageJsonLd({
    name: "ShortsOS Insights",
    description: INSIGHTS_INTRO,
    parts: articles.map((a) => ({ schemaType: a.schemaType, headline: a.title, datePublished: a.publishedOn })),
  });

  return (
    <main>
      <section className="section">
        <div className="shell">
          <p className="eyebrow">Insights</p>
          <h1>Written from the product&apos;s own record</h1>
          <p className="lede">{INSIGHTS_INTRO}</p>
        </div>
      </section>

      {SECTIONS.map((section) => {
        const items = articles.filter((a) => a.flow === section.flow);
        if (items.length === 0) return null;
        return (
          <section key={section.flow} className="section">
            <div className="shell">
              <p className="eyebrow">{section.eyebrow}</p>
              <h2>{section.title}</h2>
              <div className="grid grid-2" style={{ marginTop: 24 }}>
                {items.map((a) => (
                  <article key={a.slug} className="card insight-card">
                    <p className="insight-meta">
                      {a.publishedOn} · {a.readingTimeMinutes} min read
                    </p>
                    <h3>
                      <Link href={a.route}>{a.title}</Link>
                    </h3>
                    <p>{a.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
