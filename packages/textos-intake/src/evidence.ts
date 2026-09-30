/**
 * `textos-intake-evidence@1` — the API records a site keeps next to what it published, so that
 * every build can re-verify the release offline (no token, no network, nothing trusted from the
 * intake run itself): the job, its output artifact and receipt, and the human decision with the
 * exact action envelope, execution payload and trust grant it produced.
 *
 * Records are kept as the API served them, with one change: principal ids (the service
 * principal that ran the job, the person who approved) are replaced by `sha256:<hex>` of the id,
 * so a public repository never carries an account identifier. No hash the verification checks
 * covers a principal id, so redaction removes nothing a build needs.
 */
import type { ApiActionEnvelope, ApiArtifact, ApiDecision, ApiJob, ApiReceipt, ApiTrustGrant, DecisionView, JobView } from "./api-types";
import { sha256Hex } from "./canonical";
import { ShapeReader, type Json } from "./shape";

export const EVIDENCE_VERSION = "textos-intake-evidence@1";

export interface IntakeEvidence {
  evidenceVersion: typeof EVIDENCE_VERSION;
  /** When the records were read from the API (ISO 8601). */
  collectedAt: string;
  principalIds: "sha256";
  job: ApiJob;
  artifact: ApiArtifact;
  receipt: ApiReceipt;
  decision: ApiDecision;
  envelope: ApiActionEnvelope;
  executionPayload: Json;
  grant: ApiTrustGrant | null;
}

const REDACTED = /^sha256:[0-9a-f]{64}$/;

export function redactPrincipalId(id: string): string {
  return REDACTED.test(id) ? id : `sha256:${sha256Hex(id)}`;
}

export function assembleEvidence(input: {
  collectedAt: string;
  job: JobView["job"];
  artifact: ApiArtifact;
  receipt: ApiReceipt;
  decision: DecisionView;
}): IntakeEvidence {
  const { decision: view } = input;
  return {
    evidenceVersion: EVIDENCE_VERSION,
    collectedAt: input.collectedAt,
    principalIds: "sha256",
    job: { ...input.job, principalId: redactPrincipalId(input.job.principalId) },
    artifact: input.artifact,
    receipt: { ...input.receipt, principalId: redactPrincipalId(input.receipt.principalId) },
    decision: {
      ...view.decision,
      ...(view.decision.resolvedByPrincipalId !== undefined
        ? { resolvedByPrincipalId: redactPrincipalId(view.decision.resolvedByPrincipalId) }
        : {}),
    },
    envelope: view.envelope,
    executionPayload: view.executionPayload,
    grant: view.grant ?? null,
  };
}

/** Stable on-disk form: two-space JSON and a trailing newline. */
export function serializeEvidence(evidence: IntakeEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

/** Structural check of a stored evidence file. Hash and approval checks live in verify.ts. */
export function parseIntakeEvidence(raw: unknown): { evidence: IntakeEvidence | null; problems: string[] } {
  const r = new ShapeReader();
  const root = r.object(raw, "evidence");
  r.literal(root, "evidenceVersion", [EVIDENCE_VERSION] as const, "evidence");
  r.string(root, "collectedAt", "evidence");
  r.literal(root, "principalIds", ["sha256"] as const, "evidence");

  const job = r.object(root.job, "evidence.job");
  for (const key of ["id", "workspaceId", "capability", "status", "requestHash", "createdAt", "updatedAt"]) r.string(job, key, "evidence.job");
  r.match(job, "principalId", REDACTED, "a redacted principal id (sha256:<hex>)", "evidence.job");

  const artifact = r.object(root.artifact, "evidence.artifact");
  for (const key of ["id", "workspaceId", "mediaType", "contract", "sha256", "createdAt"]) r.string(artifact, key, "evidence.artifact");
  if (!("body" in artifact)) r.problems.push("evidence.artifact.body: missing");

  const receipt = r.object(root.receipt, "evidence.receipt");
  for (const key of ["version", "id", "workspaceId", "jobId", "capability", "engineSha", "channel", "inputHash", "outputHash", "createdAt", "traceId"]) {
    r.string(receipt, key, "evidence.receipt");
  }
  r.match(receipt, "principalId", REDACTED, "a redacted principal id (sha256:<hex>)", "evidence.receipt");

  const decision = r.object(root.decision, "evidence.decision");
  for (const key of ["id", "workspaceId", "capabilityId", "actionEnvelopeHash", "policyVersion", "status", "requiredRole", "createdAt", "expiresAt"]) {
    r.string(decision, key, "evidence.decision");
  }
  if (decision.resolvedByPrincipalId !== undefined) {
    r.match(decision, "resolvedByPrincipalId", REDACTED, "a redacted principal id (sha256:<hex>)", "evidence.decision");
  }

  const envelope = r.object(root.envelope, "evidence.envelope");
  for (const key of ["id", "workspaceId", "actionType", "proposedStateHash", "truthVerdict", "createdAt"]) r.string(envelope, key, "evidence.envelope");
  const target = r.object(envelope.target, "evidence.envelope.target");
  r.string(target, "kind", "evidence.envelope.target");
  r.string(target, "ref", "evidence.envelope.target");

  r.object(root.executionPayload, "evidence.executionPayload");
  if (root.grant !== null) {
    const grant = r.object(root.grant, "evidence.grant");
    for (const key of ["id", "workspaceId", "capabilityId", "actionEnvelopeHash", "source", "status"]) r.string(grant, key, "evidence.grant");
  }
  return r.problems.length === 0 ? { evidence: root as unknown as IntakeEvidence, problems: [] } : { evidence: null, problems: r.problems };
}
