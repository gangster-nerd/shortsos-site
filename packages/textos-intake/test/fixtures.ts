/**
 * SYNTHETIC release evidence for tests — built here, never received from TextOS, never written
 * into a site. `buildRelease` produces a chain that verifies; each option changes one stage and
 * every hash downstream of it is recomputed, so a test can build a consistent release that
 * differs in exactly one respect. Tampering after the fact is done on the returned object.
 */
import type { ApiActionEnvelope, ApiArtifact, ApiDecision, ApiJob, ApiReceipt, ApiTrustGrant } from "../src/api-types";
import { hashCanonical, sha256Hex } from "../src/canonical";
import { releasePayload } from "../src/collect";
import { DELIVERY_CONTRACT, RELEASE_CAPABILITY, type HeadlessDelivery } from "../src/delivery";
import { assembleEvidence, type IntakeEvidence } from "../src/evidence";
import type { IntakeExpectations } from "../src/verify";

export const SITE_ID = "example-site";
export const WORKSPACE_ID = "ws_example";
export const SCHEMA_FINGERPRINT = sha256Hex("content-document@1 schema (fixture)");
export const ENGINE_SHA = "0123456789abcdef0123456789abcdef01234567";

export const EXPECTATIONS: IntakeExpectations = {
  siteId: SITE_ID,
  workspaceId: WORKSPACE_ID,
  locales: ["fr-FR"],
  contentDocumentFingerprint: SCHEMA_FINGERPRINT,
  acceptedEngineShas: "any",
};

export function syntheticDelivery(locale = "fr-FR"): HeadlessDelivery {
  const structuredContentHash = sha256Hex(`structured content (fixture, ${locale})`);
  return {
    schemaVersion: DELIVERY_CONTRACT,
    destination: { kind: "headless_site", siteId: SITE_ID },
    workspaceId: WORKSPACE_ID,
    locale,
    source: { contentDraftId: "draft_1", briefId: "brief_1", writerMethodVersion: "geo-writer@0.2", structuredContentHash },
    truthCheck: { verdict: "pass", truthCheckId: "tc_1" },
    contentContract: { version: "content-document@1", fingerprint: SCHEMA_FINGERPRINT },
    contentDocument: {
      contentSchemaVersion: "content-document@1",
      identity: {
        documentId: "draft_1",
        contentType: "product_article",
        slug: "exemple-de-guide",
        language: locale,
        title: "Exemple de guide",
        description: "Un document d'exemple pour les tests.",
      },
      editorial: { authorIds: [], reviewerIds: [], topicIds: [], audience: "Lecteur de test", funnelStage: "consideration" },
      truth: {
        statusVocabulary: "geo-writer",
        statusVocabularyVersion: "geo-writer@0.2",
        sourceStatus: "ARTICLE_GUIDE",
        publicationStatus: "draft",
        allowedSurfaces: ["reference", "native"],
        claimIds: ["stmt-1", "stmt-2"],
        evidenceRefs: ["ev-1"],
      },
      provenance: { sourceAuthority: "UNCERTIFIED", sourceEvidenceDigest: structuredContentHash },
      body: [
        { id: "answer-1", kind: "answer", slot: "short-answer", data: { text: "Une réponse courte." } },
        { id: "why:heading", kind: "heading", level: 2, data: { text: "Pourquoi" } },
        { id: "why:body", kind: "paragraph", data: { text: "Un paragraphe de corps." } },
      ],
      relationships: { relatedContentIds: [] },
      conversion: { conversionAllowed: false },
      lifecycle: {},
      seo: { indexingIntent: "noindex", targetQuery: "exemple de guide", searchIntent: "buyer_decision" },
    },
    statementLedger: [
      { id: "stmt-1", text: "Une réponse courte.", kind: "factual", evidenceIds: ["ev-1"] },
      { id: "stmt-2", text: "Un paragraphe de corps.", kind: "editorial", evidenceIds: [] },
    ],
  };
}

export interface ReleaseOptions {
  delivery?: (d: HeadlessDelivery) => void;
  /** Replaces the whole artifact body (e.g. with another capability's result). */
  body?: (d: HeadlessDelivery) => unknown;
  payload?: (p: Record<string, unknown>) => void;
  envelope?: (e: ApiActionEnvelope) => void;
  decision?: (d: ApiDecision) => void;
  grant?: (g: ApiTrustGrant) => void;
  artifact?: (a: ApiArtifact) => void;
  receipt?: (r: ApiReceipt) => void;
  job?: (j: ApiJob) => void;
  locale?: string;
}

/** The raw records the API would serve for one release (principal ids not yet redacted). */
export function buildReleaseRecords(options: ReleaseOptions = {}) {
  const delivery = syntheticDelivery(options.locale);
  options.delivery?.(delivery);
  const body: unknown = options.body ? options.body(delivery) : delivery;
  const bodyHash = hashCanonical(body);
  const executionPayload: Record<string, unknown> = releasePayload({ siteId: SITE_ID, contentDraftId: "draft_1" });
  options.payload?.(executionPayload);

  const envelope: ApiActionEnvelope = {
    id: "env_1",
    workspaceId: WORKSPACE_ID,
    actionType: "release_headless_delivery",
    effect: "act",
    externality: "E1",
    reversibility: "R1",
    risk: "medium",
    target: { kind: "headless_site", ref: SITE_ID, protected: true },
    truthVerdict: "pass",
    evidenceStatus: "complete",
    rollback: { kind: "discard", guaranteed: true },
    proposedStateHash: bodyHash,
    traceId: "trace_env",
    createdAt: "2026-10-01T09:00:00.000Z",
  };
  options.envelope?.(envelope);
  const envelopeHash = hashCanonical(envelope);

  const decision: ApiDecision = {
    id: "dec_1",
    workspaceId: WORKSPACE_ID,
    capabilityId: RELEASE_CAPABILITY,
    actionEnvelopeHash: envelopeHash,
    policyVersion: "trust-policy@1",
    policyOutcome: "REQUIRE_REVIEW",
    status: "approved",
    requiredRole: "human",
    createdAt: "2026-10-01T09:00:01.000Z",
    expiresAt: "2026-10-08T09:00:01.000Z",
    resolvedAt: "2026-10-01T10:00:00.000Z",
    resolvedByPrincipalId: "user_reviewer_fixture",
  };
  options.decision?.(decision);

  const grant: ApiTrustGrant = {
    id: "grant_1",
    workspaceId: WORKSPACE_ID,
    capabilityId: RELEASE_CAPABILITY,
    actionEnvelopeHash: envelopeHash,
    source: "human_decision",
    sourceDecisionId: decision.id,
    policyVersion: "trust-policy@1",
    policyOutcome: "REQUIRE_REVIEW",
    executionDisposition: "execute",
    status: "consumed",
    issuedAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2026-10-02T10:00:00.000Z",
    consumedAt: "2026-10-01T10:05:00.000Z",
  };
  options.grant?.(grant);

  const artifact: ApiArtifact = {
    id: "artifact_out",
    workspaceId: WORKSPACE_ID,
    mediaType: "application/json",
    contract: DELIVERY_CONTRACT,
    sha256: bodyHash,
    body,
    createdAt: "2026-10-01T10:05:00.000Z",
  };
  options.artifact?.(artifact);

  const receipt: ApiReceipt = {
    version: "receipt@1",
    id: "receipt_1",
    workspaceId: WORKSPACE_ID,
    principalId: "svc_site_fixture",
    jobId: "job_1",
    capability: RELEASE_CAPABILITY,
    engineSha: ENGINE_SHA,
    channel: "job",
    inputHash: hashCanonical(executionPayload),
    outputHash: artifact.sha256,
    actionEnvelopeHash: envelopeHash,
    trustOutcome: "REQUIRE_REVIEW",
    artifactId: artifact.id,
    createdAt: "2026-10-01T10:05:00.000Z",
    traceId: "trace_job",
  };
  options.receipt?.(receipt);

  const job: ApiJob = {
    id: "job_1",
    workspaceId: WORKSPACE_ID,
    principalId: "svc_site_fixture",
    capability: RELEASE_CAPABILITY,
    status: "succeeded",
    requestHash: sha256Hex("request (fixture)"),
    createdAt: "2026-10-01T10:04:00.000Z",
    updatedAt: "2026-10-01T10:05:00.000Z",
    artifactId: artifact.id,
    receiptId: receipt.id,
    revision: 3,
    attempt: 1,
    inputArtifactId: "artifact_in",
    outputArtifactId: artifact.id,
    trustGrantId: grant.id,
    actionEnvelopeHash: envelopeHash,
    reservedCostMicros: 0,
  };
  options.job?.(job);

  return { job, artifact, receipt, decisionView: { decision, envelope, executionPayload, grant } };
}

export function buildRelease(options: ReleaseOptions = {}): IntakeEvidence {
  const records = buildReleaseRecords(options);
  return assembleEvidence({ collectedAt: "2026-10-01T10:06:00.000Z", ...records, decision: records.decisionView });
}

/** A deep copy the test can tamper with freely. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
