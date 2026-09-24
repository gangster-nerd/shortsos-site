/**
 * ShortsOS editorial brief — the ShortsOS-owned input a TextOS run is prepared from
 * (`textos/briefs/<articleId>.json`). A brief is the CMO decision, written down: which buyer
 * question, why now (source commits, or the Site Intelligence finding), what evidence may be
 * used, who approved that evidence and under what authority, and the slot plan the TextOS writer
 * must fill. It is data, reviewed in the diff; nothing in it is generated.
 */
import type { Surface } from "../manifest/schema";

export const ARTICLE_FLOWS = ["commit_to_content", "site_intelligence"] as const;
export type ArticleFlow = (typeof ARTICLE_FLOWS)[number];

/** Which manifest surface each flow publishes on — and therefore whose claims it may carry. */
export const FLOW_SURFACE: Record<ArticleFlow, Surface> = {
  commit_to_content: "developer_note",
  site_intelligence: "faq",
};

/** How each flow is named to a reader (article eyebrow, share image). */
export const FLOW_LABEL: Record<ArticleFlow, string> = {
  commit_to_content: "Engineering note",
  site_intelligence: "Answer",
};

/** Every TextOS-produced article lives under /insights/ — the route is shared, the manifest
 *  surface (and so what the article may claim) is per flow, see FLOW_SURFACE. */
export const INSIGHTS_ROUTE_PREFIX = "/insights/";

export type BriefEvidenceSource =
  /** A quote from a product commit message; the commit must be in the committed ledger. */
  | { kind: "product_commit"; sha: string; quote: string }
  /** A quote from a file of the product repository, read at exactly the pinned product ref. */
  | { kind: "product_file"; path: string; quote: string }
  /** A quote from a ratified field of the pinned Public Truth manifest. */
  | { kind: "manifest_field"; entityId: string; field: "claimCeiling" | "prohibitedClaims" | "knownLimits"; quote: string };

export interface BriefEvidence {
  id: string;
  source: BriefEvidenceSource;
  claimTypes: string[];
  maxSupportStrength: "descriptive" | "comparative" | "causal" | "quantified";
  limitations: string[];
}

export interface BriefClearance {
  evidenceIds: string[];
  decision: "APPROVE_PUBLIC_USE" | "REJECT_PUBLIC_USE";
  clientValidation: "CLIENT_VALIDATE" | "DO_NOT_VALIDATE";
  actor: string;
  actorCapacity: string;
  decidedAt: string;
  reason: string;
}

export interface BriefSlot {
  id: string;
  role: "title" | "meta_description" | "lead" | "section" | "answer" | "caption" | "call_to_action";
  blockKind: "single_line" | "paragraph" | "multi_paragraph";
  headingLevel: 2 | 3 | null;
  heading: string | null;
  writingObjective: string;
  buyerIntent: string | null;
  allowedEvidenceIds: string[];
  requiredClaimTypes: string[];
  unsupportedClaimTypes: string[];
  minChars: number;
  maxChars: number;
  evidenceRequired: boolean;
}

/** The Site Intelligence finding a `site_intelligence` brief acts on — pages cited by URL from
 *  the committed TextOS snapshot, identified by its hash. */
export interface BriefSiteObservation {
  snapshotHash: string;
  proposalQuestion: string;
  pagesConsulted: string[];
  finding: string;
  interventionMode: "create";
}

/** Publication record kept by the site, not by TextOS: when the page went into the site, under
 *  whose mandate, and where the per-article human review stands. */
export interface BriefPublication {
  publishedOn: string;
  mandate: string;
  humanReview: { status: "pending" | "done"; reviewer: string | null; reviewedOn: string | null };
}

export interface ArticleBrief {
  briefVersion: 1;
  articleId: string;
  flow: ArticleFlow;
  slug: string;
  locale: string;
  publicationChannel: "controlled_preview" | "public_web";
  /** Manifest entities this article is about or mentions — each must exist in the pinned manifest. */
  entityIds: string[];
  /** Provenance for the TextOS CTC seam; `canonicalProductSha` is filled from the manifest pin. */
  provenance: {
    ctcSourceGroups: { groupId: string; sourceCommits: string[] }[];
    buyerQuestion: string;
    targetQuery: string;
    targetQueryProvenance: "HUMAN_CMO";
    demandEvidenceStatus: "NOT_MEASURED";
    demandEvidenceRefs: string[];
    keywordVolumeStatus: "UNKNOWN";
    searchIntent: string;
    topicCluster: string;
  };
  siteObservation: BriefSiteObservation | null;
  approval: { approvedBy: string; approvedAt: string };
  /** Absent = not published: the brief and its run stay in the repository but render nowhere. */
  publication?: BriefPublication;
  clearances: BriefClearance[];
  evidence: BriefEvidence[];
  slots: BriefSlot[];
}

/** File name a slot's prompt/response is stored under (slot ids are plain identifiers). */
export function promptFileName(slotId: string): string {
  return `${slotId}.md`;
}

export function responseFileName(slotId: string): string {
  return `${slotId}.json`;
}

/**
 * The `data-cse-block-id` an article page puts on each rendered block, so TextOS's render-parity
 * oracle can find it: the slot id on the text, and this id on the section heading above it.
 */
export function headingBlockId(slotId: string): string {
  return `${slotId}--heading`;
}
