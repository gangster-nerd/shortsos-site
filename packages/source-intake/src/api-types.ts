/**
 * The records of the release protocol this package reads, as a source's API serves them (REST
 * routes under `/api/v1/workspaces/{workspaceId}/…`): jobs, artifacts, receipts, decisions with
 * their action envelope and trust grant. Only the wire format is described here; a site depends
 * on it alone, never on a source's code.
 */

export const RECEIPT_VERSION = "receipt@1";

export type JobStatus = "queued" | "running" | "input_required" | "succeeded" | "failed" | "canceled";

/** `GET …/jobs/{jobId}` → `{ job, links, traceId }`. Readable only by the principal that invoked it. */
export interface ApiJob {
  id: string;
  workspaceId: string;
  principalId: string;
  capability: string;
  status: JobStatus;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
  artifactId?: string;
  receiptId?: string;
  failureCode?: string;
  revision?: number;
  attempt?: number;
  inputArtifactId?: string;
  outputArtifactId?: string;
  trustGrantId?: string;
  actionEnvelopeHash?: string;
  reservedCostMicros?: number;
}

export interface JobView {
  job: ApiJob;
  links: { artifact?: string; receipt?: string };
  traceId?: string;
}

/** `GET …/artifacts/{artifactId}` → `{ artifact, traceId }`. `sha256` = hashCanonical(body). */
export interface ApiArtifact<T = unknown> {
  id: string;
  workspaceId: string;
  mediaType: string;
  contract: string;
  sha256: string;
  body: T;
  createdAt: string;
}

export type TrustOutcome = "AUTO_EXECUTE" | "EXECUTE_AND_NOTIFY" | "REQUIRE_REVIEW" | "BLOCK";

/**
 * `GET …/receipts/{receiptId}` → `{ receipt, traceId }`. For a durable job: `inputHash` is the
 * hash of the payload the job ran with, `outputHash` = the output artifact's `sha256`,
 * `artifactId` = the output artifact, `actionEnvelopeHash` = the approved action it executed.
 */
export interface ApiReceipt {
  version: string;
  id: string;
  workspaceId: string;
  principalId: string;
  jobId: string;
  capability: string;
  engineSha: string;
  channel: string;
  inputHash: string;
  outputHash: string;
  actionEnvelopeHash?: string;
  trustOutcome?: TrustOutcome;
  artifactId?: string;
  createdAt: string;
  traceId: string;
}

export type DecisionStatus = "pending" | "approved" | "rejected" | "expired" | "superseded";

export interface ApiDecision {
  id: string;
  workspaceId: string;
  capabilityId: string;
  actionEnvelopeHash: string;
  policyVersion: string;
  policyOutcome: string;
  status: DecisionStatus;
  requiredRole: string;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedByPrincipalId?: string;
  supersededByDecisionId?: string;
}

/** The exact action a human approves; its canonical hash is the decision's `actionEnvelopeHash`. */
export interface ApiActionEnvelope {
  id: string;
  workspaceId: string;
  actionType: string;
  effect: string;
  externality: string;
  reversibility: string;
  risk: string;
  target: { kind: string; ref: string; protected: boolean };
  truthVerdict: string;
  evidenceStatus: string;
  rollback: { kind: string; guaranteed: boolean };
  beforeStateHash?: string;
  proposedStateHash: string;
  traceId: string;
  createdAt: string;
}

export interface ApiTrustGrant {
  id: string;
  workspaceId: string;
  capabilityId: string;
  actionEnvelopeHash: string;
  source: "policy" | "human_decision";
  sourceDecisionId?: string;
  policyVersion: string;
  policyOutcome: TrustOutcome;
  executionDisposition: string;
  status: "active" | "claimed" | "consumed" | "revoked" | "expired";
  issuedAt: string;
  expiresAt: string;
  claimedByExecutionId?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  consumedAt?: string;
}

/**
 * `GET …/decisions/{decisionId}` → readable only by the principal that requested the decision.
 * `executionPayload` is what the approved action must be invoked with; `grant` exists once a
 * human approved.
 */
export interface DecisionView {
  decision: ApiDecision;
  envelope: ApiActionEnvelope;
  executionPayload: Record<string, unknown>;
  grant?: ApiTrustGrant;
  links?: Record<string, string>;
  traceId?: string;
}

/** RFC 9457 problem details, as every API error is returned. */
export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
}
