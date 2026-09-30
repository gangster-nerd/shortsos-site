/**
 * Fail-closed verification of a release, from the stored evidence alone.
 *
 * A delivery is accepted only if the whole chain holds, recomputed here rather than read:
 *
 *   artifact.body ──hashCanonical──▶ artifact.sha256 = receipt.outputHash = envelope.proposedStateHash
 *   executionPayload ──hashCanonical──▶ receipt.inputHash
 *   envelope ──hashCanonical──▶ decision.actionEnvelopeHash = grant.actionEnvelopeHash
 *                               = receipt.actionEnvelopeHash (= job.actionEnvelopeHash)
 *   decision (approved, by a human) ──issued──▶ grant ──ran──▶ job ──produced──▶ receipt, artifact
 *   envelope.target = this site;  delivery.destination = this site;  everything in its workspace
 *
 * In words: a person approved releasing exactly these bytes to exactly this site, the job ran
 * that approved action with the approved payload, and what it produced is what is stored. Then
 * the body itself: the ContentDocument@1 contract this site pins (by schema fingerprint), a
 * locale the site serves, a TruthCheck `pass`, and the writer hash the document carries.
 *
 * Every failure is collected and returned; nothing is accepted with a failure.
 */
import { RECEIPT_VERSION } from "./api-types";
import { GIT_SHA, hashCanonical } from "./canonical";
import { DELIVERY_CONTRACT, DELIVERY_TARGET_KIND, RELEASE_CAPABILITY, parseHeadlessDelivery, type HeadlessDelivery } from "./delivery";
import { parseIntakeEvidence, type IntakeEvidence } from "./evidence";

/** What one site accepts. Comes from the site's committed configuration, never from the API. */
export interface IntakeExpectations {
  /** The id TextOS addresses this site by (`envelope.target.ref`, `delivery.destination.siteId`). */
  siteId: string;
  /** The TextOS workspace this site is the destination of. */
  workspaceId: string;
  /** BCP 47 tags of the languages the site publishes, e.g. ["en-US"]. */
  locales: readonly string[];
  /** sha256 of the ContentDocument@1 JSON Schema the site renders against. */
  contentDocumentFingerprint: string;
  /** TextOS engine SHAs the site accepts releases from, or "any" to accept and record any. */
  acceptedEngineShas: readonly string[] | "any";
}

export type IntakeFailureCode =
  | "evidence_malformed"
  | "workspace_mismatch"
  | "job_not_succeeded"
  | "capability_mismatch"
  | "artifact_hash_mismatch"
  | "artifact_not_a_delivery"
  | "receipt_mismatch"
  | "engine_not_accepted"
  | "input_not_the_approved_payload"
  | "decision_not_approved"
  | "decision_not_human"
  | "envelope_mismatch"
  | "grant_mismatch"
  | "approval_does_not_cover_this_content"
  | "destination_mismatch"
  | "delivery_malformed"
  | "content_contract_mismatch"
  | "locale_not_served"
  | "structured_hash_mismatch"
  | "truthcheck_not_pass";

export interface IntakeFailure {
  code: IntakeFailureCode;
  message: string;
}

export interface VerifiedDelivery {
  delivery: HeadlessDelivery;
  evidence: IntakeEvidence;
  artifactId: string;
  /** hashCanonical(delivery) — what the person approved and what was released. */
  artifactSha256: string;
  engineSha: string;
  decisionId: string;
  actionEnvelopeHash: string;
  approvedAt: string;
}

export type VerifyResult = { ok: true; verified: VerifiedDelivery } | { ok: false; failures: IntakeFailure[] };

export function verifyEvidence(evidence: IntakeEvidence, expect: IntakeExpectations): VerifyResult {
  const failures: IntakeFailure[] = [];
  const fail = (code: IntakeFailureCode, message: string) => failures.push({ code, message });
  const { job, artifact, receipt, decision, envelope, grant, executionPayload } = evidence;

  // Every record belongs to this site's workspace.
  const workspaces: [string, string][] = [
    ["job", job.workspaceId],
    ["artifact", artifact.workspaceId],
    ["receipt", receipt.workspaceId],
    ["decision", decision.workspaceId],
    ["envelope", envelope.workspaceId],
  ];
  if (grant) workspaces.push(["grant", grant.workspaceId]);
  for (const [name, workspaceId] of workspaces) {
    if (workspaceId !== expect.workspaceId) fail("workspace_mismatch", `${name} belongs to workspace ${workspaceId}, this site's is ${expect.workspaceId}`);
  }

  // The job is a finished release that produced this artifact and this receipt.
  if (job.status !== "succeeded") fail("job_not_succeeded", `job ${job.id} is ${job.status}${job.failureCode ? ` (${job.failureCode})` : ""}`);
  const capabilities: [string, string][] = [
    ["job", job.capability],
    ["receipt", receipt.capability],
    ["decision", decision.capabilityId],
  ];
  if (grant) capabilities.push(["grant", grant.capabilityId]);
  for (const [name, capability] of capabilities) {
    if (capability !== RELEASE_CAPABILITY) fail("capability_mismatch", `${name} is for ${capability}; a release to a site is ${RELEASE_CAPABILITY}`);
  }
  const jobOutput = job.outputArtifactId ?? job.artifactId;
  if (jobOutput !== artifact.id) fail("receipt_mismatch", `job ${job.id} produced ${jobOutput ?? "no artifact"}, not ${artifact.id}`);
  if (job.receiptId !== receipt.id || receipt.jobId !== job.id) fail("receipt_mismatch", `receipt ${receipt.id} and job ${job.id} do not name each other`);

  // The artifact body is what its hash says, and it is a delivery.
  const bodyHash = hashCanonical(artifact.body);
  if (bodyHash !== artifact.sha256) fail("artifact_hash_mismatch", `artifact ${artifact.id} body hashes to ${bodyHash}, not ${artifact.sha256}`);
  if (artifact.contract !== DELIVERY_CONTRACT) {
    fail("artifact_not_a_delivery", `artifact ${artifact.id} is ${artifact.contract}; a site receives only ${DELIVERY_CONTRACT}`);
  }
  if (artifact.mediaType !== "application/json") fail("artifact_not_a_delivery", `artifact ${artifact.id} is ${artifact.mediaType}, not application/json`);

  // The receipt accounts for this output, from this input, on a known engine.
  if (receipt.version !== RECEIPT_VERSION) fail("receipt_mismatch", `receipt version ${receipt.version}, expected ${RECEIPT_VERSION}`);
  if (receipt.artifactId !== artifact.id || receipt.outputHash !== bodyHash) fail("receipt_mismatch", `receipt ${receipt.id} does not account for this artifact's body`);
  if (!GIT_SHA.test(receipt.engineSha)) fail("receipt_mismatch", `receipt engineSha ${JSON.stringify(receipt.engineSha)} is not a commit SHA`);
  else if (expect.acceptedEngineShas !== "any" && !expect.acceptedEngineShas.includes(receipt.engineSha)) {
    fail("engine_not_accepted", `released by TextOS ${receipt.engineSha}, which this site does not accept`);
  }
  if (receipt.inputHash !== hashCanonical(executionPayload)) {
    fail("input_not_the_approved_payload", "the job ran with another payload than the approved decision's execution payload");
  }
  if (receipt.trustOutcome === "BLOCK") fail("decision_not_approved", "the receipt records a BLOCK trust outcome");

  // A person approved this exact action, and the job ran under the grant that approval issued.
  if (decision.status !== "approved") fail("decision_not_approved", `decision ${decision.id} is ${decision.status}`);
  if (decision.requiredRole !== "human" || !decision.resolvedByPrincipalId || !decision.resolvedAt) {
    fail("decision_not_human", `decision ${decision.id} was not resolved by a person`);
  }
  const envelopeHash = hashCanonical(envelope);
  if (decision.actionEnvelopeHash !== envelopeHash) fail("envelope_mismatch", `the stored action envelope is not the one decision ${decision.id} approved`);
  if (receipt.actionEnvelopeHash !== envelopeHash || (job.actionEnvelopeHash !== undefined && job.actionEnvelopeHash !== envelopeHash)) {
    fail("envelope_mismatch", `job ${job.id} did not execute the approved action`);
  }
  if (!grant) {
    fail("grant_mismatch", `decision ${decision.id} issued no trust grant`);
  } else {
    if (grant.source !== "human_decision" || grant.sourceDecisionId !== decision.id) fail("grant_mismatch", `grant ${grant.id} was not issued by decision ${decision.id}`);
    if (grant.actionEnvelopeHash !== envelopeHash) fail("grant_mismatch", `grant ${grant.id} authorizes another action`);
    if (job.trustGrantId !== grant.id) fail("grant_mismatch", `job ${job.id} did not run under grant ${grant.id}`);
    if (grant.status !== "consumed" && grant.status !== "claimed") fail("grant_mismatch", `grant ${grant.id} is ${grant.status}, not used by a release`);
  }

  // The approved action released this content to this site.
  if (envelope.target.kind !== DELIVERY_TARGET_KIND || envelope.target.ref !== expect.siteId) {
    fail("destination_mismatch", `the approved action targets ${envelope.target.kind}:${envelope.target.ref}, not ${DELIVERY_TARGET_KIND}:${expect.siteId}`);
  }
  if (envelope.proposedStateHash !== bodyHash) {
    fail("approval_does_not_cover_this_content", "the approved action proposed other content than the artifact released");
  }
  if (envelope.truthVerdict !== "pass") fail("truthcheck_not_pass", `the approved action carries truth verdict ${envelope.truthVerdict}`);

  // The delivery itself.
  const parsed = parseHeadlessDelivery(artifact.body);
  if (!parsed.delivery) {
    for (const problem of parsed.problems) fail("delivery_malformed", problem);
    return { ok: false, failures };
  }
  const delivery = parsed.delivery;
  if (delivery.destination.siteId !== expect.siteId) fail("destination_mismatch", `delivery is addressed to ${delivery.destination.siteId}, not ${expect.siteId}`);
  if (delivery.workspaceId !== expect.workspaceId) fail("workspace_mismatch", `delivery names workspace ${delivery.workspaceId}`);
  if (delivery.contentContract.fingerprint !== expect.contentDocumentFingerprint) {
    fail(
      "content_contract_mismatch",
      `document validated against ContentDocument@1 schema ${delivery.contentContract.fingerprint}; this site renders ${expect.contentDocumentFingerprint}`,
    );
  }
  const document = delivery.contentDocument;
  if (document.identity.language !== delivery.locale) fail("delivery_malformed", `document language ${document.identity.language} differs from delivery locale ${delivery.locale}`);
  if (!expect.locales.includes(delivery.locale)) fail("locale_not_served", `this site publishes ${expect.locales.join(", ") || "no language"}; the delivery is ${delivery.locale}`);
  if (document.provenance.sourceEvidenceDigest !== delivery.source.structuredContentHash) {
    fail("structured_hash_mismatch", "the document's sourceEvidenceDigest is not the writer's structured content hash");
  }
  if (delivery.truthCheck.verdict !== "pass") fail("truthcheck_not_pass", `TruthCheck verdict is ${delivery.truthCheck.verdict}`);
  if (delivery.statementLedger) {
    const ledger = new Set(delivery.statementLedger.map((s) => s.id));
    const missing = document.truth.claimIds.filter((id) => !ledger.has(id));
    if (missing.length > 0) fail("delivery_malformed", `claims ${missing.join(", ")} are not in the writer's statement ledger`);
  }

  if (failures.length > 0) return { ok: false, failures };
  return {
    ok: true,
    verified: {
      delivery,
      evidence,
      artifactId: artifact.id,
      artifactSha256: bodyHash,
      engineSha: receipt.engineSha,
      decisionId: decision.id,
      actionEnvelopeHash: envelopeHash,
      approvedAt: decision.resolvedAt!,
    },
  };
}

/** Parse a stored evidence file (already JSON-decoded), then verify it. */
export function verifyStoredEvidence(raw: unknown, expect: IntakeExpectations): VerifyResult {
  const parsed = parseIntakeEvidence(raw);
  if (!parsed.evidence) return { ok: false, failures: parsed.problems.map((message) => ({ code: "evidence_malformed" as const, message })) };
  return verifyEvidence(parsed.evidence, expect);
}
