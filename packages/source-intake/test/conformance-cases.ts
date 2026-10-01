/**
 * The conformance cases: defined here, written to conformance/cases/ by scripts/conformance.ts,
 * checked by conformance.test.ts. Each case states its expected outcome BY HAND — never by
 * running the implementation — so the kit tests an implementation instead of mirroring it.
 * All releases are SYNTHETIC (test/fixtures.ts), from a fictional source, never received.
 */
import { hashCanonical } from "../src/canonical";
import type { IntakeEvidence } from "../src/evidence";
import type { IntakeExpectations, IntakeFailureCode } from "../src/verify";
import { ENGINE_SHA, EXPECTATIONS, SITE_ID, buildRelease, clone, type ReleaseOptions } from "./fixtures";

export const CASE_VERSION = "source-intake-conformance@1";

export interface ConformanceCase {
  caseVersion: typeof CASE_VERSION;
  id: string;
  description: string;
  expectations: IntakeExpectations;
  evidence: IntakeEvidence;
  expected: { ok: true; artifactSha256: string; decisionId: string } | { ok: false; codes: IntakeFailureCode[] };
}

interface Definition {
  slug: string;
  description: string;
  /** A consistent release differing in one respect (every downstream hash recomputed). */
  build?: ReleaseOptions;
  /** A change made after the fact, on the stored evidence. */
  tamper?: (evidence: IntakeEvidence) => void;
  expectations?: Partial<IntakeExpectations>;
  /** Absent = the release must be accepted. */
  codes?: IntakeFailureCode[];
}

const REVIEW_CAPABILITY = "acme.prepare_article_review@1";
const setTitle = (evidence: IntakeEvidence, title: string) => {
  (evidence.artifact.body as { contentDocument: { identity: { title: string } } }).contentDocument.identity.title = title;
};

const DEFINITIONS: Definition[] = [
  { slug: "consistent-release", description: "A consistent release, approved by a person, for this site." },
  {
    slug: "engine-in-allowlist",
    description: "The site accepts only listed engines, and the release ran on one of them.",
    expectations: { acceptedEngineShas: [ENGINE_SHA] },
  },
  {
    slug: "body-edited-after-release",
    description: "The stored body was edited after the release.",
    tamper: (e) => setTitle(e, "Titre retouché"),
    codes: ["artifact_hash_mismatch", "receipt_mismatch", "approval_does_not_cover_this_content"],
  },
  {
    slug: "body-edited-hash-recomputed",
    description: "The stored body was edited and its artifact hash recomputed to match.",
    tamper: (e) => {
      setTitle(e, "Titre retouché");
      e.artifact.sha256 = hashCanonical(e.artifact.body);
    },
    codes: ["receipt_mismatch", "approval_does_not_cover_this_content"],
  },
  {
    slug: "approval-for-other-content",
    description: "The person approved an action that proposed other content than the one released.",
    build: { envelope: (env) => (env.proposedStateHash = hashCanonical({ other: "content" })) },
    codes: ["approval_does_not_cover_this_content"],
  },
  {
    slug: "article-review-is-not-a-release",
    description: "A consistent chain whose artifact is an Article Review result, not a release.",
    build: {
      body: () => ({
        status: "article_ready",
        disposition: "created",
        contentDraftId: "draft_1",
        validationState: "pending_human_review",
        verdict: "pass",
        readingTimeMinutes: 4,
        title: "Exemple de guide",
      }),
      artifact: (a) => (a.contract = "acme-prepare-article-review-result@1"),
      job: (j) => (j.capability = REVIEW_CAPABILITY),
      receipt: (r) => (r.capability = REVIEW_CAPABILITY),
      decision: (d) => (d.capabilityId = REVIEW_CAPABILITY),
      grant: (g) => (g.capabilityId = REVIEW_CAPABILITY),
    },
    codes: ["capability_mismatch", "artifact_not_a_delivery", "delivery_malformed"],
  },
  {
    slug: "job-ran-another-payload",
    description: "The job ran with another payload than the approved execution payload.",
    build: { receipt: (r) => (r.inputHash = hashCanonical({ contentDraftId: "draft_2", destination: { kind: "headless_site", siteId: SITE_ID } })) },
    codes: ["input_not_the_approved_payload"],
  },
  { slug: "decision-pending", description: "Nobody decided yet.", build: { decision: (d) => (d.status = "pending") }, codes: ["decision_not_approved"] },
  { slug: "decision-rejected", description: "The person rejected the release.", build: { decision: (d) => (d.status = "rejected") }, codes: ["decision_not_approved"] },
  { slug: "decision-expired", description: "The decision expired.", build: { decision: (d) => (d.status = "expired") }, codes: ["decision_not_approved"] },
  {
    slug: "decision-resolved-by-nobody",
    description: "The decision says approved but names no one who resolved it.",
    build: { decision: (d) => delete d.resolvedByPrincipalId },
    codes: ["decision_not_human"],
  },
  {
    slug: "envelope-swapped-after-approval",
    description: "The stored action envelope is not the one approved.",
    tamper: (e) => (e.envelope.risk = "low"),
    codes: ["envelope_mismatch", "grant_mismatch"],
  },
  {
    slug: "grant-from-policy",
    description: "The job ran under a policy grant, not one issued by the person's decision.",
    build: { grant: (g) => ((g.source = "policy"), delete g.sourceDecisionId) },
    codes: ["grant_mismatch"],
  },
  { slug: "job-under-another-grant", description: "The job ran under another grant.", build: { job: (j) => (j.trustGrantId = "grant_other") }, codes: ["grant_mismatch"] },
  { slug: "grant-never-used", description: "The grant is still active: no release used it.", build: { grant: (g) => (g.status = "active") }, codes: ["grant_mismatch"] },
  { slug: "decision-without-grant", description: "The decision issued no grant.", tamper: (e) => (e.grant = null), codes: ["grant_mismatch"] },
  {
    slug: "addressed-to-another-site",
    description: "A consistent release approved for another site.",
    build: { delivery: (d) => (d.destination.siteId = "other-site"), envelope: (env) => (env.target.ref = "other-site") },
    codes: ["destination_mismatch"],
  },
  {
    slug: "another-workspace",
    description: "The site is the destination of another workspace.",
    expectations: { workspaceId: "ws_other" },
    codes: ["workspace_mismatch"],
  },
  {
    slug: "job-failed",
    description: "The release job failed.",
    build: { job: (j) => ((j.status = "failed"), (j.failureCode = "capability_execution_failed")) },
    codes: ["job_not_succeeded"],
  },
  { slug: "job-names-another-receipt", description: "The job and the receipt do not name each other.", build: { job: (j) => (j.receiptId = "receipt_other") }, codes: ["receipt_mismatch"] },
  {
    slug: "engine-not-accepted",
    description: "The site accepts only listed engines, and the release ran on another.",
    expectations: { acceptedEngineShas: ["f".repeat(40)] },
    codes: ["engine_not_accepted"],
  },
  { slug: "language-not-served", description: "A French release for a site that publishes English only.", expectations: { locales: ["en-US"] }, codes: ["locale_not_served"] },
  {
    slug: "other-content-schema",
    description: "The document was validated against another ContentDocument@1 schema.",
    build: { delivery: (d) => (d.contentContract.fingerprint = "e".repeat(64)) },
    codes: ["content_contract_mismatch"],
  },
  { slug: "truthcheck-alert", description: "The truth check raised an alert.", build: { delivery: (d) => (d.truthCheck.verdict = "alert") }, codes: ["truthcheck_not_pass"] },
  {
    slug: "approved-action-truth-fail",
    description: "The approved action carries a failed truth verdict.",
    build: { envelope: (env) => (env.truthVerdict = "fail") },
    codes: ["truthcheck_not_pass"],
  },
  {
    slug: "writer-hash-differs",
    description: "The document's digest is not the writer's structured content hash.",
    build: { delivery: (d) => (d.source.structuredContentHash = "d".repeat(64)) },
    codes: ["structured_hash_mismatch"],
  },
  {
    slug: "claim-outside-ledger",
    description: "The document claims a statement missing from the writer's ledger.",
    build: { delivery: (d) => d.contentDocument.truth.claimIds.push("stmt-9") },
    codes: ["delivery_malformed"],
  },
  {
    slug: "unknown-block-kind",
    description: "A block kind outside the ContentDocument@1 vocabulary.",
    build: { delivery: (d) => ((d.contentDocument.body[0] as { kind: string }).kind = "hero_banner") },
    codes: ["delivery_malformed"],
  },
  {
    slug: "document-language-differs",
    description: "The document's language is not the delivery's locale.",
    build: { delivery: (d) => (d.contentDocument.identity.language = "en-US") },
    codes: ["delivery_malformed"],
  },
  {
    slug: "raw-principal-id-stored",
    description: "The stored evidence carries an account identifier instead of its digest.",
    tamper: (e) => (e.receipt.principalId = "svc_site_fixture"),
    codes: ["evidence_malformed"],
  },
];

export function buildConformanceCases(): ConformanceCase[] {
  return DEFINITIONS.map((definition, index) => {
    const evidence = clone(buildRelease(definition.build));
    definition.tamper?.(evidence);
    return {
      caseVersion: CASE_VERSION,
      id: `${String(index + 1).padStart(2, "0")}-${definition.slug}`,
      description: definition.description,
      expectations: { ...EXPECTATIONS, ...definition.expectations },
      evidence,
      expected: definition.codes
        ? { ok: false, codes: [...new Set(definition.codes)].sort() }
        : { ok: true, artifactSha256: hashCanonical(evidence.artifact.body), decisionId: evidence.decision.id },
    };
  });
}

export function serializeCase(conformanceCase: ConformanceCase): string {
  return `${JSON.stringify(conformanceCase, null, 2)}\n`;
}
