/**
 * The TextOS contracts the ShortsOS drivers consume, declared by ShortsOS as a CLIENT: a typed
 * mirror of the shapes TextOS exposes at the writer SHA pinned in `textos/tool.json`, never an
 * import of TextOS types (ShortsOS type-checks without a TextOS checkout on disk, and TextOS is
 * never vendored). If TextOS changes one of these shapes, the pinned SHA moves deliberately and
 * this mirror moves with it — the same discipline `src/lib/manifest/schema.ts` applies to the
 * product manifest.
 *
 * Source files at the pinned SHA (for review, not imported):
 *   src/server/textos/act/evidence-corpus.ts            ApprovedEvidenceItem, GenerationPolicy
 *   src/server/textos/act/structured-content-draft.ts   DraftStatement
 *   src/server/textos/act/geo-writer/execution-plan.ts  GeoWriterSlot, GeoWriterExecutionPlan
 *   src/server/textos/act/ctc/types.ts                  CtcGeoWriterProvenance, CtcGeoWriterIntake
 *   src/server/textos/observe/claims.ts                 ClaimProfile, MentionedEntity
 */

export type PublicationChannel = "internal_demo" | "controlled_preview" | "public_web";
export type EvidenceSupportStrength = "descriptive" | "comparative" | "causal" | "quantified";
export type SubjectKind = "tracked_brand" | "owned_product" | "competitor" | "general_domain";

export interface EvidenceSubject {
  kind: SubjectKind;
  name: string | null;
}

export interface ApprovedEvidenceItem {
  id: string;
  kind: "official_brand_evidence" | "third_party_observation" | "competitor_claim" | "general_domain_evidence" | "unverified_claim";
  sourceUrl: string | null;
  sourceTitle: string;
  sourcePublisher: string | null;
  retrievedAt: string | null;
  contentHash: string;
  excerpt: string;
  subject: EvidenceSubject;
  claimTypes: string[];
  maxSupportStrength: EvidenceSupportStrength;
  limitations?: string[];
  epistemicStatus?: "operator_supplied" | "client_validated" | "public_source";
  publicUse?: "allowed" | "pending" | "restricted" | "not_applicable";
  publicExcerpt?: string;
  approvedForGeneration: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalScope: { briefIds: string[]; locale: string; channel: PublicationChannel };
}

export interface GenerationPolicy {
  mode: "general_educational_no_tracked_brand_facts" | "grounded_tracked_brand_authorized";
  trackedEntityId: string;
  trackedBrandNames: string[];
  forbiddenProductNames: string[];
}

export type EvidenceUsabilityContext =
  | { channel: "internal_demo"; briefId?: string; locale?: string }
  | { channel: "controlled_preview"; briefId: string; locale: string }
  | { channel: "public_web"; briefId: string; locale: string };

export interface ClaimProfile {
  id: string;
  version: string | null;
  claimTypes: readonly string[];
  lexicon: Record<string, string[]>;
}

export interface MentionedEntity {
  name: string;
  aliases: string[];
  matchedTrackedEntityId: string | null;
  role?: "tracked" | "competitor" | "owned_product";
}

export interface DraftStatement {
  id: string;
  text: string;
  kind: "factual" | "recommendation" | "textos_observation" | "editorial";
  subject: EvidenceSubject;
  claimTypes: string[];
  evidenceIds: string[];
  evidenceStrengthRequired: EvidenceSupportStrength;
}

export interface GeoWriterSlot {
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

export interface CtcSourceGroup {
  groupId: string;
  sourceCommits: string[];
}

export interface CtcGeoWriterProvenance {
  ctcSourceGroups: CtcSourceGroup[];
  canonicalProductSha: string;
  buyerQuestion: string;
  targetQuery: string;
  targetQueryProvenance: "HUMAN_CMO" | "DEMAND_EVIDENCE";
  demandEvidenceStatus: "NOT_MEASURED" | "MEASURED";
  demandEvidenceRefs: string[];
  keywordVolumeStatus: "UNKNOWN" | "MEASURED";
  searchIntent: string;
  topicCluster: string;
}

export interface CtcGeoWriterIntake {
  provenance: CtcGeoWriterProvenance;
  locale: string;
  policy: GenerationPolicy;
  publicationContext: EvidenceUsabilityContext;
  claimProfile: ClaimProfile;
  roster: MentionedEntity[];
  evidence: ApprovedEvidenceItem[];
  slots: GeoWriterSlot[];
}

export interface GeoWriterExecutionPlan {
  planId: string;
  locale: string;
  targetQuery: string;
  policy: GenerationPolicy;
  publicationContext: EvidenceUsabilityContext;
  evidence: ApprovedEvidenceItem[];
  claimProfile: ClaimProfile;
  roster: MentionedEntity[];
  slots: GeoWriterSlot[];
}
