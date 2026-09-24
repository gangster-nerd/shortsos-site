/**
 * Loads the TextOS-produced articles committed under `textos/runs/<articleId>/` and turns them
 * into what `/insights/**` renders — after checking, fail closed, that what is rendered is exactly
 * what TextOS wrote and checked, and that it stays within what the manifest allows.
 *
 * An article renders only if ALL of these hold (any failure throws at build time and in tests):
 *  - its run receipt says TruthCheck `pass`, from the TextOS writer SHA pinned in textos/tool.json;
 *  - the committed ContentDocument and resolved surface hash-match the receipt, and name this
 *    article, this slug and the flow's own surface policy;
 *  - every rendered sentence is the writer's own slot text (no edit after the check);
 *  - every source commit and commit-quoting piece of evidence resolves in the committed ledger;
 *  - every entity it names exists in the pinned manifest, and a `faq`-surface article only names
 *    public_marketable entities that authorize `faq`;
 *  - its evidence was cleared for the channel it was written for, and the site's indexing switch
 *    is not on while any published article was only checked for `controlled_preview`;
 *  - its conversion plan comes from the pinned CMO surface polish, was computed on exactly these
 *    committed artefacts, carries no commercial slot, and its editorial next step (if any) is
 *    another published article, shown with that article's own title and description, and never
 *    one only checked for `controlled_preview` from an article checked for `public_web`.
 *
 * Nothing here reaches TextOS: this is ShortsOS reading its own committed artefacts.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SITE_ALLOWS_INDEXING } from "../config/site-config";
import { parseProductCommitLedger, resolveCitedCommit, type ProductCommit, type ProductCommitLedger } from "../commit-to-content/commit-ledger";
import type { CapabilityManifest, ManifestEntity, PublicationStatus, Surface } from "../manifest/schema";
import { FLOW_LABEL, FLOW_SURFACE, INSIGHTS_ROUTE_PREFIX, headingBlockId, type ArticleBrief, type ArticleFlow } from "./brief";

export { FLOW_LABEL, headingBlockId };

export class ArticleIntegrityError extends Error {
  constructor(articleId: string, message: string) {
    super(`textos article ${articleId}: ${message}`);
    this.name = "ArticleIntegrityError";
  }
}

// ── Committed artefact shapes (only the fields this site reads) ────────────────────────────────

interface RunReceipt {
  articleId: string;
  textos: { repository: string; sha: string };
  writerMethodVersion: string;
  slotProviderMethodVersion: string;
  derivationIdentity: string;
  structuredContentHash: string;
  truthCheckVerdict: string;
  publicationChannel: string;
  canonicalProductSha: string;
  contentDocumentSha256: string;
  resolvedSurfaceSha256: string;
  humanReview: string;
}

interface ContentDocumentFile {
  contentSchemaVersion: string;
  identity: { documentId: string; contentType: string; slug: string; language: string; title: string; description: string };
  truth: { sourceStatus: string; evidenceRefs: string[] };
  provenance: { sourceEvidenceDigest?: string; sourceAuthority: string; sourceSha?: string };
  body: { id: string; kind: string; data: { text?: string } }[];
  seo: { indexingIntent: string };
}

interface ResolvedSurfaceFile {
  documentId: string;
  slug: string;
  title: string;
  description: string;
  policyId: string;
  readingTimeMinutes: number;
  metadata: { emitSchemaOrg: boolean; schemaType: string | null; effectiveIndexing: string };
  blocks: { order: number; visible: boolean; block: { id: string; kind: string; data: { text?: string } } }[];
}

interface LineageSlot {
  slotId: string;
  role: string;
  headingLevel: 2 | 3 | null;
  heading: string | null;
  text: string;
  evidenceIdsUsed: string[];
}

interface LineageFile {
  slotProvenance: LineageSlot[];
  structuredContentHash: string;
  truthCheck: { verdict: string };
  canonicalProductSha: string;
  derivationIdentity: string;
}

interface IntakeEvidence {
  id: string;
  sourceTitle: string;
  excerpt: string;
  epistemicStatus?: string;
  publicUse?: string;
  approvalScope: { channel: string; briefIds: string[] };
}

interface ConversionPlanFile {
  conversionPlanVersion: number;
  articleId: string;
  tool: { repository: string; sha: string };
  inputs: { contentDocumentSha256: string; resolvedSurfaceSha256: string; commercialCapability: string; cta: null };
  plan: { commercial: { enabled: boolean; header: unknown; contextual: unknown; final: unknown } };
  editorialNextStep: { targetArticleId: string; route: string; label: string; description: string; source: string } | null;
}

// ── What pages render ───────────────────────────────────────────────────────────────────────────

export interface ArticleBlock {
  slotId: string;
  role: "lead" | "answer" | "section" | "caption" | "call_to_action";
  heading: string | null;
  headingLevel: 2 | 3 | null;
  text: string;
}

export interface ArticleSourceCommit {
  sha: string;
  shortSha: string;
  date: string;
  subject: string;
}

export interface ArticleEntityStatus {
  id: string;
  status: PublicationStatus;
  availability: ManifestEntity["availability"];
  allowedSurfaces: Surface[];
}

/** "Read next": derived by the CMO surface polish, checked against the target article. */
export interface ArticleNextStep {
  targetArticleId: string;
  route: string;
  label: string;
  description: string;
}

export interface InsightArticle {
  articleId: string;
  flow: ArticleFlow;
  surface: Surface;
  slug: string;
  route: string;
  title: string;
  description: string;
  language: string;
  publishedOn: string;
  humanReview: "pending" | "done";
  readingTimeMinutes: number;
  schemaType: string;
  blocks: ArticleBlock[];
  buyerQuestion: string;
  sourceCommits: ArticleSourceCommit[];
  manifestSources: { entityId: string; fields: string[] }[];
  entityStatuses: ArticleEntityStatus[];
  channel: "controlled_preview" | "public_web";
  siteObservation: ArticleBrief["siteObservation"];
  nextStep: ArticleNextStep | null;
  /** Every piece of text the page shows, for copy-safety and wording checks. */
  allText: string[];
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function readText(path: string, articleId: string): string {
  if (!existsSync(path)) throw new ArticleIntegrityError(articleId, `missing ${path}`);
  return readFileSync(path, "utf8");
}

function readJson<T>(path: string, articleId: string): T {
  return JSON.parse(readText(path, articleId)) as T;
}

export interface ArticleLoadContext {
  root: string;
  manifest: CapabilityManifest;
  ledger: ProductCommitLedger;
  pinnedTextosSha: string;
  pinnedSurfacePolishSha: string;
  surfacePolicyIds: Record<string, string>;
  indexingAllowed: boolean;
}

/** Pure-ish validation of ONE article's committed artefacts (reads only under `root`). */
export function loadArticle(brief: ArticleBrief, ctx: ArticleLoadContext): InsightArticle {
  const id = brief.articleId;
  const fail = (message: string): never => {
    throw new ArticleIntegrityError(id, message);
  };
  const runDir = join(ctx.root, "textos", "runs", id);
  const receipt = readJson<RunReceipt>(join(runDir, "receipt.json"), id);
  const documentRaw = readText(join(runDir, "content-document.json"), id);
  const resolvedRaw = readText(join(runDir, "resolved-surface.json"), id);
  const document = JSON.parse(documentRaw) as ContentDocumentFile;
  const resolved = JSON.parse(resolvedRaw) as ResolvedSurfaceFile;
  const lineage = readJson<LineageFile>(join(runDir, "lineage.json"), id);
  const intake = readJson<{ evidence: IntakeEvidence[] }>(join(runDir, "intake.json"), id);
  const conversion = readJson<ConversionPlanFile>(join(runDir, "conversion-plan.json"), id);

  const publication = brief.publication;
  if (!publication) fail("has no publication record — unpublished briefs are never rendered");

  // Receipt: the right tool, a passing check.
  if (receipt.articleId !== id) fail(`receipt names ${receipt.articleId}`);
  if (receipt.textos.sha !== ctx.pinnedTextosSha) fail(`written with TextOS ${receipt.textos.sha}, the pinned tool is ${ctx.pinnedTextosSha}`);
  if (receipt.truthCheckVerdict !== "pass" || lineage.truthCheck.verdict !== "pass") fail("TruthCheck verdict is not pass");
  if (receipt.publicationChannel !== brief.publicationChannel) fail("receipt channel differs from the brief");

  // Hash chain: receipt ↔ committed files ↔ writer lineage.
  if (sha256(documentRaw) !== receipt.contentDocumentSha256) fail("content-document.json does not match its receipt hash");
  if (sha256(resolvedRaw) !== receipt.resolvedSurfaceSha256) fail("resolved-surface.json does not match its receipt hash");
  if (document.provenance.sourceEvidenceDigest !== lineage.structuredContentHash || lineage.structuredContentHash !== receipt.structuredContentHash) {
    fail("structured content hash differs between document, lineage and receipt");
  }
  if (document.contentSchemaVersion !== "content-document@1") fail(`unexpected contract ${document.contentSchemaVersion}`);
  if (document.identity.documentId !== `shortsos:${id}` || document.identity.slug !== brief.slug) fail("document identity does not match the brief");
  if (document.truth.sourceStatus !== "truthCheck:pass") fail(`document sourceStatus is ${document.truth.sourceStatus}`);
  if (resolved.documentId !== document.identity.documentId || resolved.slug !== brief.slug || resolved.title !== document.identity.title) {
    fail("resolved surface does not match the document");
  }
  const surface = FLOW_SURFACE[brief.flow];
  const expectedPolicy = ctx.surfacePolicyIds[surface];
  if (!expectedPolicy || resolved.policyId !== expectedPolicy) fail(`resolved with policy ${resolved.policyId}, expected ${expectedPolicy}`);

  // Rendered text is the writer's own slot text, block for block.
  const slotsById = new Map(lineage.slotProvenance.map((s) => [s.slotId, s]));
  const titleSlot = lineage.slotProvenance.find((s) => s.role === "title");
  const metaSlot = lineage.slotProvenance.find((s) => s.role === "meta_description");
  if (!titleSlot || titleSlot.text !== document.identity.title) fail("title is not the writer's title slot");
  if (!metaSlot || metaSlot.text !== document.identity.description) fail("description is not the writer's meta slot");
  const blocks: ArticleBlock[] = resolved.blocks
    .filter((b) => b.visible)
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const slot = slotsById.get(b.block.id);
      const docBlock = document.body.find((d) => d.id === b.block.id);
      if (!slot || !docBlock) fail(`block ${b.block.id} has no writer slot or document block`);
      const text = b.block.data.text ?? "";
      if (text !== slot!.text || docBlock!.data.text !== slot!.text) fail(`block ${b.block.id} text differs from the writer's slot`);
      return {
        slotId: slot!.slotId,
        role: slot!.role as ArticleBlock["role"],
        heading: slot!.heading,
        headingLevel: slot!.headingLevel,
        text,
      };
    });

  // Commits: every cited commit is in the product's publishable history.
  const resolveOrFail = (sha: string): ProductCommit => {
    try {
      return resolveCitedCommit(ctx.ledger, sha);
    } catch (err) {
      return fail((err as Error).message);
    }
  };
  resolveOrFail(lineage.canonicalProductSha);
  const sourceShas = brief.provenance.ctcSourceGroups.flatMap((g) => g.sourceCommits);
  for (const ev of brief.evidence) {
    if (ev.source.kind === "product_commit") resolveOrFail(ev.source.sha);
  }
  const sourceCommits = [...new Set(sourceShas)].map((sha) => {
    const c = resolveOrFail(sha);
    return { sha: c.sha, shortSha: c.sha.slice(0, 7), date: c.date.slice(0, 10), subject: c.subject };
  });

  // Entities: exist, and a faq-surface article only names entities cleared for it.
  const entityStatuses = brief.entityIds.map((entityId) => {
    const entity = ctx.manifest.entities.find((e) => e.id === entityId);
    if (!entity) fail(`names ${entityId}, which is not in the pinned manifest`);
    if (surface === "faq" && (entity!.derivedPublicationStatus !== "public_marketable" || !entity!.allowedSurfaces.includes("faq"))) {
      fail(`is a faq-surface article but ${entityId} does not authorize a public claim on faq`);
    }
    return {
      id: entity!.id,
      status: entity!.derivedPublicationStatus,
      availability: entity!.availability,
      allowedSurfaces: entity!.allowedSurfaces,
    };
  });

  // Channel: evidence was usable where it was written for; indexing cannot outrun it.
  const citedIds = new Set(lineage.slotProvenance.flatMap((s) => s.evidenceIdsUsed));
  for (const ev of intake.evidence.filter((e) => citedIds.has(e.id))) {
    if (ev.approvalScope.channel !== brief.publicationChannel || !ev.approvalScope.briefIds.includes(id)) {
      fail(`evidence ${ev.id} was not approved for ${brief.publicationChannel} on this article`);
    }
    if (brief.publicationChannel === "public_web" && (ev.publicUse !== "allowed" || ev.epistemicStatus !== "client_validated")) {
      fail(`evidence ${ev.id} is cited on public_web without a client-validated public-use clearance`);
    }
  }
  if (ctx.indexingAllowed && brief.publicationChannel !== "public_web") {
    fail("the site is indexable but this article was only checked for controlled_preview — re-run it for public_web first");
  }

  // Developer notes carry no capability claim: no entity's claim ceiling may appear in them.
  const allText = [document.identity.title, document.identity.description, ...blocks.flatMap((b) => [b.heading ?? "", b.text])].filter(
    (t) => t.length > 0,
  );
  if (surface === "developer_note") {
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").replace(/[.;:!?]+$/, "").trim();
    const joined = allText.map(norm).join("\n");
    for (const entity of ctx.manifest.entities) {
      const firstSentence = norm(entity.claimCeiling.split(/(?<=\.)\s/)[0] ?? "");
      if (firstSentence.length > 20 && joined.includes(firstSentence)) {
        fail(`restates the claim ceiling of ${entity.id} on developer_note, a surface no entity authorizes`);
      }
    }
  }

  // Conversion plan: the pinned CMO surface polish, on these artefacts, never commercial.
  if (conversion.articleId !== id) fail(`conversion plan names ${conversion.articleId}`);
  if (conversion.tool.sha !== ctx.pinnedSurfacePolishSha) {
    fail(`conversion plan comes from ${conversion.tool.sha}, the pinned surface polish is ${ctx.pinnedSurfacePolishSha}`);
  }
  if (
    conversion.inputs.contentDocumentSha256 !== receipt.contentDocumentSha256 ||
    conversion.inputs.resolvedSurfaceSha256 !== receipt.resolvedSurfaceSha256
  ) {
    fail("conversion plan was computed on other artefacts than the committed document and surface");
  }
  const { commercial } = conversion.plan;
  if (
    conversion.inputs.commercialCapability !== "unconfigured" ||
    conversion.inputs.cta !== null ||
    commercial.enabled ||
    commercial.header !== null ||
    commercial.contextual !== null ||
    commercial.final !== null
  ) {
    fail("conversion plan carries a commercial slot; insights pages carry none");
  }
  const step = conversion.editorialNextStep;
  if (step && (step.targetArticleId === id || !step.route.startsWith(INSIGHTS_ROUTE_PREFIX))) {
    fail(`next step ${step.route} is not another insights article`);
  }
  const nextStep: ArticleNextStep | null = step
    ? { targetArticleId: step.targetArticleId, route: step.route, label: step.label, description: step.description }
    : null;

  const manifestSources = [...new Set(brief.evidence.flatMap((e) => (e.source.kind === "manifest_field" ? [e.source.entityId] : [])))].map(
    (entityId) => ({
      entityId,
      fields: [...new Set(brief.evidence.flatMap((e) => (e.source.kind === "manifest_field" && e.source.entityId === entityId ? [e.source.field] : [])))],
    }),
  );

  return {
    articleId: id,
    flow: brief.flow,
    surface,
    slug: brief.slug,
    route: `${INSIGHTS_ROUTE_PREFIX}${brief.slug}/`,
    title: document.identity.title,
    description: document.identity.description,
    language: document.identity.language,
    publishedOn: publication!.publishedOn,
    humanReview: publication!.humanReview.status,
    readingTimeMinutes: resolved.readingTimeMinutes,
    schemaType: resolved.metadata.schemaType ?? "Article",
    blocks,
    buyerQuestion: brief.provenance.buyerQuestion,
    sourceCommits,
    manifestSources,
    entityStatuses,
    channel: brief.publicationChannel,
    siteObservation: brief.siteObservation,
    nextStep,
    allText: nextStep ? [...allText, nextStep.label, nextStep.description] : allText,
  };
}

export function readBriefs(root: string): ArticleBrief[] {
  const dir = join(root, "textos", "briefs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ArticleBrief);
}

export function defaultArticleContext(root: string = process.cwd()): ArticleLoadContext {
  const inputs = join(root, "content-bundles", "inputs");
  const tool = JSON.parse(readFileSync(join(root, "textos", "tool.json"), "utf8")) as {
    writer: { sha: string };
    surfacePolish: { sha: string };
  };
  const policies = JSON.parse(readFileSync(join(root, "textos", "client", "surface-policy.json"), "utf8")) as {
    policies: Record<string, { policyId: string }>;
  };
  return {
    root,
    manifest: JSON.parse(readFileSync(join(inputs, "manifest.json"), "utf8")) as CapabilityManifest,
    ledger: parseProductCommitLedger(readFileSync(join(inputs, "product-commits.json"), "utf8")),
    pinnedTextosSha: tool.writer.sha,
    pinnedSurfacePolishSha: tool.surfacePolish.sha,
    surfacePolicyIds: Object.fromEntries(Object.entries(policies.policies).map(([surface, p]) => [surface, p.policyId])),
    indexingAllowed: SITE_ALLOWS_INDEXING,
  };
}

let cached: InsightArticle[] | null = null;

/** Every published article, newest first, then by title. Throws on any integrity failure. */
export function loadInsightArticles(ctx: ArticleLoadContext = defaultArticleContext()): InsightArticle[] {
  if (cached && ctx.root === process.cwd()) return cached;
  const articles = readBriefs(ctx.root)
    .filter((b) => b.publication !== undefined)
    .map((b) => loadArticle(b, ctx))
    .sort((a, b) => (a.publishedOn === b.publishedOn ? a.title.localeCompare(b.title) : a.publishedOn < b.publishedOn ? 1 : -1));
  const slugs = new Set<string>();
  for (const a of articles) {
    if (slugs.has(a.slug)) throw new ArticleIntegrityError(a.articleId, `duplicate slug ${a.slug}`);
    slugs.add(a.slug);
  }
  // A next step shows its target's own words, and never lowers the channel a page was checked for.
  for (const a of articles) {
    if (!a.nextStep) continue;
    const target = articles.find((t) => t.articleId === a.nextStep!.targetArticleId);
    if (!target) throw new ArticleIntegrityError(a.articleId, `next step ${a.nextStep.targetArticleId} is not a published article`);
    if (a.nextStep.route !== target.route || a.nextStep.label !== target.title || a.nextStep.description !== target.description) {
      throw new ArticleIntegrityError(a.articleId, `next step does not show ${target.articleId} as that article reads`);
    }
    if (a.channel === "public_web" && target.channel !== "public_web") {
      throw new ArticleIntegrityError(a.articleId, `is checked for public_web but its next step ${target.articleId} only for ${target.channel}`);
    }
  }
  if (ctx.root === process.cwd()) cached = articles;
  return articles;
}

export function getInsightArticle(slug: string): InsightArticle {
  const article = loadInsightArticles().find((a) => a.slug === slug);
  if (!article) throw new Error(`no published insight article with slug ${slug}`);
  return article;
}

/** Plain-language meaning of a publication status, for the status table on each article. */
export const STATUS_MEANING: Record<PublicationStatus, string> = {
  public_marketable: "Cleared for a public claim — on the surfaces the manifest lists.",
  candidate: "Real engineering, not cleared for any public claim.",
  internal_only: "Internal engineering only; no public claim of any kind.",
  blocked: "Never to be claimed publicly, whatever the evidence.",
};
