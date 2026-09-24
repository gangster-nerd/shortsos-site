/**
 * Step `conversion-plan` — the CMO surface polish of TextOS's content-surface engine
 * (gangster-nerd/textos-site, pinned as `surfacePolish` in textos/tool.json), run on ShortsOS's
 * published articles the way a client would run it.
 *
 * Two TextOS functions do the work, unmodified:
 *  - `resolveRelatedContent` ranks the other articles of the corpus against each one (explicit
 *    relation, shared topic, shared capability, shared claim). It reads its corpus from
 *    `content/managed-corpus/` under the working directory, so this step runs it from a temporary
 *    directory holding ShortsOS's own corpus: the committed ContentDocuments, with the relation
 *    inputs the geo-writer bridge leaves empty filled from each brief (capabilities: the manifest
 *    entities the brief names; topic: the brief's topic cluster; publication status: its
 *    publication record). Nothing is written to the checkout.
 *  - `deriveResolvedConversionPlan` turns the resolved surface and that ranking into a plan. The
 *    commercial capability is always "unconfigured" and no CTA is passed, so the commercial slots
 *    stay empty whatever a policy says, and the campaign copy that module carries for TextOS's own
 *    site never reaches this one. Only the editorial next step can come out.
 *
 * One ShortsOS rule is applied to the ranking: an article checked for public_web never points to
 * an article only checked for controlled_preview, since the target's title and description would
 * appear on it.
 *
 * Writes `textos/runs/<articleId>/conversion-plan.json` for every published article.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { TEXTOS_DIR, TEXTOS_REF, TEXTOS_ROOT, readJson, sha256, writeJson } from "./lib";
import { INSIGHTS_ROUTE_PREFIX, type ArticleBrief } from "../../../src/lib/textos/brief";

const COMMERCIAL_CAPABILITY = "unconfigured";

interface CseDocument {
  identity: { documentId: string; slug: string; title: string; description: string };
  editorial: Record<string, unknown>;
  truth: Record<string, unknown>;
  [key: string]: unknown;
}

interface RelatedEntry {
  documentId: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  isDraft: boolean;
  reasons: readonly string[];
  score: number;
}

interface ConversionPlan {
  commercial: { enabled: boolean; header: unknown; contextual: unknown; final: unknown };
  editorialNextStep: { label: string; href: string; description: string; source: string } | null;
  retention: { enabled: boolean };
}

async function cseModule<T>(relativePath: string): Promise<T> {
  return (await import(pathToFileURL(join(TEXTOS_ROOT, "lib", "content-surface-engine", relativePath)).href)) as T;
}

async function main(): Promise<void> {
  const briefs = readdirSync(join(TEXTOS_DIR, "briefs"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson<ArticleBrief>(join(TEXTOS_DIR, "briefs", f)))
    .filter((b) => b.publication !== undefined);
  const bySlug = new Map(briefs.map((b) => [b.slug, b]));
  const runFile = (b: ArticleBrief, name: string) => join(TEXTOS_DIR, "runs", b.articleId, name);

  // ShortsOS's corpus, as TextOS's related-content ranking reads one.
  const corpus = briefs.map((b) => {
    const doc = readJson<CseDocument>(runFile(b, "content-document.json"));
    const topic = b.provenance.topicCluster;
    return {
      brief: b,
      doc: {
        ...doc,
        editorial: { ...doc.editorial, primaryTopicId: topic, topicIds: [topic] },
        truth: { ...doc.truth, capabilityIds: [...b.entityIds], publicationStatus: "published" },
      } as CseDocument,
    };
  });
  const corpusRoot = mkdtempSync(join(tmpdir(), "shortsos-cse-corpus-"));
  const corpusDir = join(corpusRoot, "content", "managed-corpus");
  mkdirSync(corpusDir, { recursive: true });
  for (const { doc } of corpus) writeFileSync(join(corpusDir, `${doc.identity.slug}.json`), `${JSON.stringify(doc, null, 2)}\n`);

  const previousCwd = process.cwd();
  process.chdir(corpusRoot);
  try {
    const { resolveRelatedContent } = await cseModule<{
      resolveRelatedContent(opts: { target: CseDocument; publicOnly?: boolean; limit?: number }): RelatedEntry[];
    }>("site-integration/related-resolution.ts");
    const { deriveResolvedConversionPlan } = await cseModule<{
      deriveResolvedConversionPlan(input: {
        resolved: unknown;
        cta: null;
        sourceRelated: unknown;
        computedRelated: readonly RelatedEntry[];
        newsletterEnabled: boolean;
        commercialCapability: string;
      }): ConversionPlan;
    }>("site-integration/conversion-plan.ts");
    const { findSourceRelatedSection } = await cseModule<{ findSourceRelatedSection(document: unknown): unknown }>(
      "site-integration/related-source-links.ts",
    );

    const corpusSummary = corpus.map(({ brief, doc }) => ({
      documentId: doc.identity.documentId,
      slug: doc.identity.slug,
      channel: brief.publicationChannel,
      primaryTopicId: brief.provenance.topicCluster,
      capabilityIds: brief.entityIds,
    }));

    for (const { brief, doc } of corpus) {
      const documentRaw = readFileSync(runFile(brief, "content-document.json"), "utf8");
      const resolvedRaw = readFileSync(runFile(brief, "resolved-surface.json"), "utf8");

      const related = resolveRelatedContent({ target: doc, publicOnly: true, limit: 6 });
      const allowed = related.filter(
        (r) => !(brief.publicationChannel === "public_web" && bySlug.get(r.slug)?.publicationChannel !== "public_web"),
      );
      const excludedByChannel = related
        .filter((r) => !allowed.includes(r))
        .map((r) => ({
          documentId: r.documentId,
          reason: "only checked for controlled_preview: its title and description may not appear on a public_web article",
        }));

      const plan = deriveResolvedConversionPlan({
        resolved: JSON.parse(resolvedRaw),
        cta: null,
        sourceRelated: findSourceRelatedSection(JSON.parse(documentRaw)),
        computedRelated: allowed,
        newsletterEnabled: false,
        commercialCapability: COMMERCIAL_CAPABILITY,
      });
      const { commercial } = plan;
      if (commercial.enabled || commercial.header || commercial.contextual || commercial.final) {
        throw new Error(`conversion-plan: ${brief.articleId} came out with a commercial slot — refusing to record it.`);
      }

      let editorialNextStep: {
        targetArticleId: string;
        route: string;
        label: string;
        description: string;
        source: string;
      } | null = null;
      const step = plan.editorialNextStep;
      if (step) {
        const slug = /^\/insights\/([a-z0-9-]+)\/?$/.exec(step.href)?.[1];
        const target = slug ? bySlug.get(slug) : undefined;
        if (!target || target.articleId === brief.articleId) {
          throw new Error(`conversion-plan: ${brief.articleId} next step ${step.href} is not another published ShortsOS article.`);
        }
        editorialNextStep = {
          targetArticleId: target.articleId,
          route: `${INSIGHTS_ROUTE_PREFIX}${target.slug}/`,
          label: step.label,
          description: step.description,
          source: step.source,
        };
      }

      writeJson(runFile(brief, "conversion-plan.json"), {
        conversionPlanVersion: 1,
        articleId: brief.articleId,
        tool: {
          repository: "gangster-nerd/textos-site",
          sha: TEXTOS_REF,
          functions: ["resolveRelatedContent", "findSourceRelatedSection", "deriveResolvedConversionPlan"],
        },
        inputs: {
          contentDocumentSha256: sha256(documentRaw),
          resolvedSurfaceSha256: sha256(resolvedRaw),
          commercialCapability: COMMERCIAL_CAPABILITY,
          cta: null,
          newsletterEnabled: false,
          corpus: corpusSummary,
          corpusNote:
            "The committed ContentDocuments, with capabilityIds, primaryTopicId/topicIds and publicationStatus filled from each brief (entityIds, provenance.topicCluster, publication record).",
        },
        related,
        excludedByChannel,
        plan,
        editorialNextStep,
      });
      console.log(
        `conversion-plan: ${brief.articleId} → ${editorialNextStep ? editorialNextStep.targetArticleId : "no next step"} ` +
          `(${related.length} ranked, ${excludedByChannel.length} excluded by channel)`,
      );
    }
  } finally {
    process.chdir(previousCwd);
    rmSync(corpusRoot, { recursive: true, force: true });
  }
}

await main();
