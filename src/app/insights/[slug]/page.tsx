import type { Metadata } from "next";
import Link from "next/link";

import { INSIGHTS_AUTHORSHIP, INSIGHTS_NEXT_STEP_LABEL, INSIGHTS_NOTE_NOTICE, INSIGHTS_PROVENANCE } from "@/content/copy-sources";
import { SITE_ORIGIN } from "@/lib/config/site-config";
import { buildArticleJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { FLOW_LABEL, STATUS_MEANING, getInsightArticle, headingBlockId, loadInsightArticles, type ArticleBlock } from "@/lib/textos/articles";

// Static export: one page per published article, nothing resolved at request time.
export const dynamicParams = false;

export function generateStaticParams() {
  return loadInsightArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getInsightArticle(slug);
  return pageMetadata({
    path: article.route,
    title: article.title,
    description: article.description,
    type: "article",
    publishedTime: article.publishedOn,
    shareImage: article.slug,
  });
}

// Each block carries the id the render-parity check looks for: the heading at the writer's level,
// then the text, both exactly as written.
function BlockContent({ block }: { block: ArticleBlock }) {
  const Heading = block.headingLevel === 3 ? "h3" : "h2";
  return (
    <>
      {block.heading ? <Heading data-cse-block-id={headingBlockId(block.slotId)}>{block.heading}</Heading> : null}
      <p data-cse-block-id={block.slotId}>{block.text}</p>
    </>
  );
}

export default async function InsightArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getInsightArticle(slug);
  const jsonLd = buildArticleJsonLd({
    schemaType: article.schemaType,
    headline: article.title,
    description: article.description,
    inLanguage: article.language,
    datePublished: article.publishedOn,
    url: new URL(article.route, SITE_ORIGIN).toString(),
  });

  return (
    <main id="main">
      <section className="section">
        <div className="shell article-head">
          <p className="eyebrow">
            <Link href="/insights/">Insights</Link> · {FLOW_LABEL[article.flow]} · {article.publishedOn} ·{" "}
            {article.readingTimeMinutes} min read
          </p>
          <h1>{article.title}</h1>
          <p className="lede">{article.description}</p>
          {article.flow === "commit_to_content" ? <p className="notice">{INSIGHTS_NOTE_NOTICE}</p> : null}
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="article-body">
          {article.blocks.map((block) =>
            block.role === "answer" ? (
              <div key={block.slotId} className="short-answer">
                <p className="claim-label">In short</p>
                <BlockContent block={block} />
              </div>
            ) : (
              <div key={block.slotId}>
                <BlockContent block={block} />
              </div>
            ),
          )}
          </div>
        </div>
      </section>

      {article.nextStep ? (
        <section className="section">
          <div className="shell">
            <aside className="next-step" aria-labelledby="next-step-label">
              <p className="claim-label" id="next-step-label">
                {INSIGHTS_NEXT_STEP_LABEL}
              </p>
              <p className="next-step-title">
                <Link href={article.nextStep.route}>{article.nextStep.label}</Link>
              </p>
              <p className="next-step-description">{article.nextStep.description}</p>
            </aside>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="shell article-sources">
          <h2>Sources</h2>
          {article.sourceCommits.length > 0 ? (
            <>
              <p className="prose">
                {article.flow === "commit_to_content"
                  ? "Product commits this note was written from:"
                  : "Product commits that established the ratified wording this answer rests on:"}
              </p>
              <ul className="source-list">
                {article.sourceCommits.map((c) => (
                  <li key={c.sha}>
                    <code>shortsos@{c.shortSha}</code> <span className="insight-meta">{c.date}</span> — {c.subject}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {article.manifestSources.length > 0 ? (
            <p className="prose" style={{ marginTop: 16 }}>
              Ratified public wording quoted from the ShortsOS Public Truth manifest (
              {article.manifestSources.map((m) => `${m.entityId}: ${m.fields.join(", ")}`).join("; ")}). The claim itself is
              shown in full on the <Link href="/proof/">Proof page</Link>.
            </p>
          ) : null}

          <h2 style={{ marginTop: 40 }}>What may be claimed today</h2>
          <div className="table-scroll">
          <table className="kv">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Status</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {article.entityStatuses.map((e) => (
                <tr key={e.id}>
                  <td>
                    <code>{e.id}</code>
                  </td>
                  <td>{e.status}</td>
                  <td>{STATUS_MEANING[e.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <h2 style={{ marginTop: 40 }}>How this page was made</h2>
          <p className="prose">{INSIGHTS_PROVENANCE[article.flow]}</p>
          <p className="prose" style={{ marginTop: 12 }}>
            {INSIGHTS_AUTHORSHIP[article.humanReview]}
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
