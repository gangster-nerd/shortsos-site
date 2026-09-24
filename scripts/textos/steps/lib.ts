/**
 * Shared plumbing for the ShortsOS → TextOS drivers. Only ever run through `scripts/textos/run.ts`,
 * which pins and guards the TextOS checkout (see its header). Every TextOS function is reached by a
 * dynamic import of the pinned checkout — ShortsOS imports are relative paths only, so TextOS's
 * own path aliases (resolved by the TextOS tsconfig this process runs under) never capture them.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  ApprovedEvidenceItem,
  CtcGeoWriterIntake,
  CtcGeoWriterProvenance,
  DraftStatement,
  GeoWriterExecutionPlan,
  GeoWriterSlot,
} from "./textos-contracts";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — run this step through \`npm run textos -- <step> --textos-path <path>\`.`);
  }
  return value;
}

export const TEXTOS_ROOT = requiredEnv("TEXTOS_ROOT");
export const TEXTOS_REF = requiredEnv("TEXTOS_REF");
export const SITE_ROOT = requiredEnv("SHORTSOS_SITE_ROOT");
export const TEXTOS_DIR = join(SITE_ROOT, "textos");

export function argValue(flag: string): string | null {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  return idx >= 0 ? (argv[idx + 1] ?? null) : null;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Stable on-disk form for every artefact this pipeline commits (2-space JSON + trailing newline). */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

async function textosModule<T>(relativePath: string): Promise<T> {
  return (await import(pathToFileURL(join(TEXTOS_ROOT, relativePath)).href)) as T;
}

// ── The TextOS surface ShortsOS drives (signatures as exposed at the pinned SHA) ────────────────

export interface SlotWriteRequest {
  planId: string;
  locale: string;
  targetQuery: string;
  slot: GeoWriterSlot;
  usableEvidence: ApprovedEvidenceItem[];
}

export interface SlotWriteOutput {
  text: string;
  statements: DraftStatement[];
}

export interface GeoWriterSlotProvider {
  readonly methodVersion: string;
  writeSlot(request: SlotWriteRequest): Promise<SlotWriteOutput>;
}

export interface WrittenSlot {
  slotId: string;
  role: GeoWriterSlot["role"];
  headingLevel: 2 | 3 | null;
  heading: string | null;
  text: string;
  statementIds: string[];
  evidenceIdsUsed: string[];
  usableEvidenceIds: string[];
  excludedEvidence: { evidenceId: string; reason: string }[];
}

export interface TruthCheckResult {
  verdict: "pass" | "alert" | "block";
  contradictions: { unit: string; reason: string; severity: "block" | "alert" }[];
}

export type GeoWriterOutcome =
  | {
      status: "written";
      result: {
        planId: string;
        planHash: string;
        slots: WrittenSlot[];
        document: { title: string; metaDescription: string; statementLedger: DraftStatement[] };
        structuredContentHash: string;
        writerMethodVersion: string;
        slotProviderMethodVersion: string;
        derivationIdentity: string;
        truthCheck: TruthCheckResult;
      };
    }
  | { status: "refused"; reason: string; slotId: string | null; detail: string; truthCheck?: TruthCheckResult };

export interface EvidenceApprovalDecision {
  briefIds: string[];
  locale: string;
  channel: ApprovedEvidenceItem["approvalScope"]["channel"];
  approvedBy: string;
  approvedAt: string;
}

export interface EvidenceClearanceDecision {
  evidenceId: string;
  decision: "APPROVE_PUBLIC_USE" | "REJECT_PUBLIC_USE" | "REDACT_OR_REFRAME";
  clientValidation: "CLIENT_VALIDATE" | "DO_NOT_VALIDATE";
  actor: string;
  actorCapacity: string;
  decidedAt: string;
  scope: { channel: ApprovedEvidenceItem["approvalScope"]["channel"]; candidateId: string };
  canonicalProductSha: string;
  reason?: string;
  approvedPublicWording?: string;
}

export interface ContentDocumentLike {
  contentSchemaVersion: string;
  identity: { documentId: string; contentType: string; slug: string; language: string; title: string; description: string };
  truth: { publicationStatus: string; allowedSurfaces: string[]; evidenceRefs: string[]; sourceStatus: string };
  provenance: { sourceEvidenceDigest?: string; sourceAuthority: string; sourceSha?: string };
  body: { id: string; kind: string; data: { text?: string } }[];
  seo: { indexingIntent: string };
}

export interface TextosTool {
  // Site Intelligence
  crawlSite(input: {
    rootUrl: string;
    policy: unknown;
    fetcher: unknown;
    crawlRunId: string;
    now: () => string;
  }): Promise<{ snapshot: Record<string, unknown>; rawBodies: Record<string, string> }>;
  makeCrawlPolicy(overrides?: Record<string, unknown>): Record<string, unknown>;
  createLiveFetcher(): unknown;
  // Evidence governance
  approveEvidenceForUse(
    item: ApprovedEvidenceItem,
    decision: EvidenceApprovalDecision,
  ): { approved: true; item: ApprovedEvidenceItem } | { approved: false; reason: string };
  approvalInvariantViolations(before: ApprovedEvidenceItem, after: ApprovedEvidenceItem): string[];
  clearEvidenceForPublicUse(
    item: ApprovedEvidenceItem,
    decision: EvidenceClearanceDecision,
  ): { cleared: true; item: ApprovedEvidenceItem; receipt: unknown } | { cleared: false; reason: string };
  clearanceInvariantViolations(before: ApprovedEvidenceItem, after: ApprovedEvidenceItem): string[];
  evaluateEvidenceUsability(
    item: ApprovedEvidenceItem,
    ctx: CtcGeoWriterIntake["publicationContext"],
    opts?: { statementStrength?: string },
  ): { usable: boolean; reason: string };
  // CTC seam + writer
  adaptCtcIntakeToExecutionPlan(intake: CtcGeoWriterIntake): {
    plan: GeoWriterExecutionPlan;
    provenance: CtcGeoWriterProvenance;
    executionPlanHash: string;
    ctcHandoffHash: string;
    adapterMethodVersion: string;
  };
  resolveSlotEvidence(
    plan: GeoWriterExecutionPlan,
    slot: GeoWriterSlot,
  ): { usable: ApprovedEvidenceItem[]; excluded: { evidenceId: string; reason: string }[] };
  buildSlotPrompt(request: SlotWriteRequest): { system: string; user: string };
  ClaudeGeoWriterSlotProvider: new (transport: (system: string, user: string) => Promise<unknown>) => GeoWriterSlotProvider;
  CLAUDE_GEO_WRITER_SLOT_METHOD_VERSION: string;
  writeGroundedSlots(plan: GeoWriterExecutionPlan, provider: GeoWriterSlotProvider): Promise<GeoWriterOutcome>;
  GEO_WRITER_METHOD_VERSION: string;
  // Content surface
  bridgeGeoWriterResultToContentDocument(input: {
    outcome: GeoWriterOutcome;
    documentId: string;
    slug: string;
    language: string;
    contentType: string;
    provenance: CtcGeoWriterProvenance;
    allowedSurfaces: string[];
  }): {
    document: ContentDocumentLike;
    slotProvenance: WrittenSlot[];
    writerMethodVersion: string;
    slotProviderMethodVersion: string;
    derivationIdentity: string;
    structuredContentHash: string;
    truthCheck: TruthCheckResult;
    planId: string;
    planHash: string;
    canonicalProductSha: string;
  };
  SurfacePolicySchema: { parse(value: unknown): unknown };
  resolveContentSurface(document: ContentDocumentLike, policy: unknown, certifiedLineage: unknown[]): Record<string, unknown>;
  withReadingTime(resolved: Record<string, unknown>, document: ContentDocumentLike): Record<string, unknown> & { readingTimeMinutes: number };
  computeContentTypePolicy(policy: "ARTICLE", document: ContentDocumentLike): Record<string, unknown>;
  serializeResolvedContentSurfaceToJson(surface: Record<string, unknown>): string;
}

export async function loadTextos(): Promise<TextosTool> {
  type M = Record<string, unknown>;
  const [crawl, fetchPage, approval, clearance, corpus, ctc, writer, prompt, claude, bridge, policy, resolver, articlePolicy, headless] =
    await Promise.all([
      textosModule<M>("src/server/textos/observe/site/crawl.ts"),
      textosModule<M>("src/server/textos/observe/site/fetch-page.ts"),
      textosModule<M>("src/server/textos/act/evidence-approval.ts"),
      textosModule<M>("src/server/textos/act/evidence-clearance.ts"),
      textosModule<M>("src/server/textos/act/evidence-corpus.ts"),
      textosModule<M>("src/server/textos/act/ctc/adapt-geo-writer.ts"),
      textosModule<M>("src/server/textos/act/geo-writer/writer.ts"),
      textosModule<M>("src/server/textos/act/geo-writer/providers/claude/slot-prompt.ts"),
      textosModule<M>("src/server/textos/act/geo-writer/providers/claude/slot-provider.ts"),
      textosModule<M>("src/server/textos/act/geo-writer/to-content-document.ts"),
      textosModule<M>("packages/content-surface/contract/surface-policy.ts"),
      textosModule<M>("packages/content-surface/composition/resolve-content-surface.ts"),
      textosModule<M>("packages/content-surface/policy/article-policy.ts"),
      textosModule<M>("packages/content-surface/adapters/headless-json.ts"),
    ]);

  const pick = (mod: M, name: string): never => {
    if (!(name in mod)) {
      throw new Error(`TextOS at ${TEXTOS_REF} does not export "${name}" where this driver expects it — the pin moved without the mirror.`);
    }
    return mod[name] as never;
  };

  return {
    crawlSite: pick(crawl, "crawlSite"),
    makeCrawlPolicy: pick(crawl, "makeCrawlPolicy"),
    createLiveFetcher: pick(fetchPage, "createLiveFetcher"),
    approveEvidenceForUse: pick(approval, "approveEvidenceForUse"),
    approvalInvariantViolations: pick(approval, "approvalInvariantViolations"),
    clearEvidenceForPublicUse: pick(clearance, "clearEvidenceForPublicUse"),
    clearanceInvariantViolations: pick(clearance, "clearanceInvariantViolations"),
    evaluateEvidenceUsability: pick(corpus, "evaluateEvidenceUsability"),
    adaptCtcIntakeToExecutionPlan: pick(ctc, "adaptCtcIntakeToExecutionPlan"),
    resolveSlotEvidence: pick(writer, "resolveSlotEvidence"),
    buildSlotPrompt: pick(prompt, "buildSlotPrompt"),
    ClaudeGeoWriterSlotProvider: pick(claude, "ClaudeGeoWriterSlotProvider"),
    CLAUDE_GEO_WRITER_SLOT_METHOD_VERSION: pick(claude, "CLAUDE_GEO_WRITER_SLOT_METHOD_VERSION"),
    writeGroundedSlots: pick(writer, "writeGroundedSlots"),
    GEO_WRITER_METHOD_VERSION: pick(writer, "GEO_WRITER_METHOD_VERSION"),
    bridgeGeoWriterResultToContentDocument: pick(bridge, "bridgeGeoWriterResultToContentDocument"),
    SurfacePolicySchema: pick(policy, "SurfacePolicySchema"),
    resolveContentSurface: pick(resolver, "resolveContentSurface"),
    withReadingTime: pick(articlePolicy, "withReadingTime"),
    computeContentTypePolicy: pick(articlePolicy, "computeContentTypePolicy"),
    serializeResolvedContentSurfaceToJson: pick(headless, "serializeResolvedContentSurfaceToJson"),
  };
}
