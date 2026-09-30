import { describe, expect, it } from "vitest";

import { hashCanonical } from "../src/canonical";
import { serializeEvidence } from "../src/evidence";
import { verifyEvidence, verifyStoredEvidence, type IntakeFailureCode, type VerifyResult } from "../src/verify";
import { ENGINE_SHA, EXPECTATIONS, SITE_ID, buildRelease, clone, syntheticDelivery } from "./fixtures";

function codes(result: VerifyResult): IntakeFailureCode[] {
  return result.ok ? [] : [...new Set(result.failures.map((f) => f.code))];
}

describe("verifyEvidence — a consistent release", () => {
  it("accepts it and reports what was approved", () => {
    const result = verifyEvidence(buildRelease(), EXPECTATIONS);
    expect(codes(result)).toEqual([]);
    if (!result.ok) return;
    expect(result.verified.artifactSha256).toBe(hashCanonical(syntheticDelivery()));
    expect(result.verified.decisionId).toBe("dec_1");
    expect(result.verified.approvedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(result.verified.engineSha).toBe(ENGINE_SHA);
    expect(result.verified.delivery.contentDocument.identity.slug).toBe("exemple-de-guide");
  });

  it("stores no account identifier: principal ids are sha256 digests", () => {
    const evidence = buildRelease();
    const text = serializeEvidence(evidence);
    expect(text).not.toContain("svc_site_fixture");
    expect(text).not.toContain("user_reviewer_fixture");
    expect(evidence.decision.resolvedByPrincipalId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verifyStoredEvidence(JSON.parse(text), EXPECTATIONS).ok).toBe(true);
  });

  it("refuses a stored file that still carries a raw principal id", () => {
    const raw = clone(buildRelease()) as unknown as { receipt: { principalId: string } };
    raw.receipt.principalId = "svc_site_fixture";
    const result = verifyStoredEvidence(raw, EXPECTATIONS);
    expect(codes(result)).toEqual(["evidence_malformed"]);
  });
});

describe("verifyEvidence — the content is exactly what was approved", () => {
  it("refuses a body edited after release", () => {
    const evidence = clone(buildRelease());
    (evidence.artifact.body as { contentDocument: { identity: { title: string } } }).contentDocument.identity.title = "Titre retouché";
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toContain("artifact_hash_mismatch");
  });

  it("refuses an edited body even when its artifact hash was recomputed", () => {
    const evidence = clone(buildRelease());
    (evidence.artifact.body as { contentDocument: { identity: { title: string } } }).contentDocument.identity.title = "Titre retouché";
    evidence.artifact.sha256 = hashCanonical(evidence.artifact.body);
    const found = codes(verifyEvidence(evidence, EXPECTATIONS));
    expect(found).toContain("receipt_mismatch");
    expect(found).toContain("approval_does_not_cover_this_content");
  });

  it("refuses a release whose approved action proposed other content", () => {
    const evidence = buildRelease({ envelope: (e) => (e.proposedStateHash = hashCanonical({ other: "content" })) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["approval_does_not_cover_this_content"]);
  });

  it("refuses an Article Review or any artifact that is not a release", () => {
    const evidence = buildRelease({
      artifact: (a) => (a.contract = "textos-prepare-article-review-result@1"),
      job: (j) => (j.capability = "textos.prepare_article_review@1"),
    });
    const found = codes(verifyEvidence(evidence, EXPECTATIONS));
    expect(found).toContain("artifact_not_a_delivery");
    expect(found).toContain("capability_mismatch");
  });

  it("refuses a job that ran with another payload than the approved one", () => {
    const evidence = buildRelease({ receipt: (r) => (r.inputHash = hashCanonical({ contentDraftId: "draft_2" })) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["input_not_the_approved_payload"]);
  });
});

describe("verifyEvidence — a person approved this exact action", () => {
  it("refuses a decision that is not approved", () => {
    for (const status of ["pending", "rejected", "expired", "superseded"] as const) {
      expect(codes(verifyEvidence(buildRelease({ decision: (d) => (d.status = status) }), EXPECTATIONS))).toEqual(["decision_not_approved"]);
    }
  });

  it("refuses a decision nobody resolved", () => {
    const evidence = buildRelease({ decision: (d) => delete d.resolvedByPrincipalId });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["decision_not_human"]);
  });

  it("refuses an envelope other than the one approved", () => {
    const evidence = clone(buildRelease());
    evidence.envelope.risk = "low";
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toContain("envelope_mismatch");
  });

  it("refuses a job run under a policy grant instead of the person's decision", () => {
    const evidence = buildRelease({ grant: (g) => ((g.source = "policy"), delete g.sourceDecisionId) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["grant_mismatch"]);
  });

  it("refuses a job that did not run under the decision's grant", () => {
    expect(codes(verifyEvidence(buildRelease({ job: (j) => (j.trustGrantId = "grant_other") }), EXPECTATIONS))).toEqual(["grant_mismatch"]);
    expect(codes(verifyEvidence(buildRelease({ grant: (g) => (g.status = "active") }), EXPECTATIONS))).toEqual(["grant_mismatch"]);
  });

  it("refuses a decision that issued no grant", () => {
    const evidence = { ...buildRelease(), grant: null };
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toContain("grant_mismatch");
  });
});

describe("verifyEvidence — addressed to this site, in its workspace", () => {
  it("refuses a release approved for another site", () => {
    const evidence = buildRelease({
      delivery: (d) => (d.destination.siteId = "other-site"),
      envelope: (e) => (e.target.ref = "other-site"),
    });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["destination_mismatch"]);
  });

  it("refuses records from another workspace", () => {
    expect(codes(verifyEvidence(buildRelease(), { ...EXPECTATIONS, workspaceId: "ws_other" }))).toEqual(["workspace_mismatch"]);
  });

  it("refuses a job that did not succeed", () => {
    const evidence = buildRelease({ job: (j) => ((j.status = "failed"), (j.failureCode = "capability_execution_failed")) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["job_not_succeeded"]);
  });

  it("records any engine by default and enforces an allowlist when the site sets one", () => {
    expect(verifyEvidence(buildRelease(), { ...EXPECTATIONS, acceptedEngineShas: [ENGINE_SHA] }).ok).toBe(true);
    expect(codes(verifyEvidence(buildRelease(), { ...EXPECTATIONS, acceptedEngineShas: ["f".repeat(40)] }))).toEqual(["engine_not_accepted"]);
  });
});

describe("verifyEvidence — a document this site can publish", () => {
  it("refuses a language the site does not publish", () => {
    const result = verifyEvidence(buildRelease({ locale: "fr-FR" }), { ...EXPECTATIONS, locales: ["en-US"] });
    expect(codes(result)).toEqual(["locale_not_served"]);
  });

  it("refuses a document validated against another ContentDocument@1 schema", () => {
    const evidence = buildRelease({ delivery: (d) => (d.contentContract.fingerprint = "e".repeat(64)) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["content_contract_mismatch"]);
  });

  it("refuses anything but a TruthCheck pass", () => {
    for (const verdict of ["alert", "block"] as const) {
      const evidence = buildRelease({ delivery: (d) => (d.truthCheck.verdict = verdict) });
      expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["truthcheck_not_pass"]);
    }
  });

  it("refuses a document whose writer hash is not the delivery's", () => {
    const evidence = buildRelease({ delivery: (d) => (d.source.structuredContentHash = "d".repeat(64)) });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["structured_hash_mismatch"]);
  });

  it("refuses claims missing from the writer's statement ledger", () => {
    const evidence = buildRelease({ delivery: (d) => d.contentDocument.truth.claimIds.push("stmt-9") });
    expect(codes(verifyEvidence(evidence, EXPECTATIONS))).toEqual(["delivery_malformed"]);
  });

  it("refuses unknown block kinds and malformed slugs, naming each problem", () => {
    const evidence = buildRelease({
      delivery: (d) => {
        (d.contentDocument.body[0] as { kind: string }).kind = "hero_banner";
        d.contentDocument.identity.slug = "Not A Slug";
      },
    });
    const result = verifyEvidence(evidence, EXPECTATIONS);
    expect(codes(result)).toEqual(["delivery_malformed"]);
    if (result.ok) return;
    expect(result.failures.map((f) => f.message).join("\n")).toMatch(/body\[0\]\.kind[\s\S]*identity\.slug|identity\.slug[\s\S]*body\[0\]\.kind/);
  });

  it("names the site in every destination failure", () => {
    const evidence = buildRelease({ envelope: (e) => (e.target.kind = "wordpress_site") });
    const result = verifyEvidence(evidence, EXPECTATIONS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.find((f) => f.code === "destination_mismatch")?.message).toContain(SITE_ID);
  });
});
