import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyStoredEvidence } from "../src/verify";
import { buildConformanceCases, serializeCase, type ConformanceCase } from "./conformance-cases";

/**
 * The conformance kit is what any other implementation runs to prove it behaves like this one.
 * This implementation must pass it, and the committed files must be exactly what the
 * definitions produce (scripts/conformance.ts --write regenerates them).
 */
const CASES_DIR = join(import.meta.dirname, "..", "conformance", "cases");
const committedFiles = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json")).sort();

describe("conformance kit", () => {
  it("is exactly what the case definitions produce", () => {
    const built = buildConformanceCases();
    expect(committedFiles).toEqual(built.map((c) => `${c.id}.json`));
    for (const c of built) expect(readFileSync(join(CASES_DIR, `${c.id}.json`), "utf8"), c.id).toBe(serializeCase(c));
  });

  it("covers acceptance and every failure code", () => {
    const cases = committedFiles.map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as ConformanceCase);
    expect(cases.some((c) => c.expected.ok)).toBe(true);
    const codes = new Set(cases.flatMap((c) => (c.expected.ok ? [] : c.expected.codes)));
    expect([...codes].sort()).toEqual(
      [
        "approval_does_not_cover_this_content",
        "artifact_hash_mismatch",
        "artifact_not_a_delivery",
        "capability_mismatch",
        "content_contract_mismatch",
        "decision_not_approved",
        "decision_not_human",
        "delivery_malformed",
        "destination_mismatch",
        "engine_not_accepted",
        "envelope_mismatch",
        "evidence_malformed",
        "grant_mismatch",
        "input_not_the_approved_payload",
        "job_not_succeeded",
        "locale_not_served",
        "receipt_mismatch",
        "structured_hash_mismatch",
        "truthcheck_not_pass",
        "workspace_mismatch",
      ].sort(),
    );
  });

  for (const file of committedFiles) {
    const c = JSON.parse(readFileSync(join(CASES_DIR, file), "utf8")) as ConformanceCase;
    it(`${c.id}: ${c.description}`, () => {
      const result = verifyStoredEvidence(c.evidence, c.expectations);
      if (c.expected.ok) {
        expect(result.ok ? [] : result.failures).toEqual([]);
        if (!result.ok) return;
        expect(result.verified.artifactSha256).toBe(c.expected.artifactSha256);
        expect(result.verified.decisionId).toBe(c.expected.decisionId);
      } else {
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect([...new Set(result.failures.map((f) => f.code))].sort()).toEqual(c.expected.codes);
      }
    });
  }
});
