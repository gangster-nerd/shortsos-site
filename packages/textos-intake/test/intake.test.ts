import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readableText } from "../src/delivery";
import { serializeEvidence } from "../src/evidence";
import { checkCommittedDelivery, receiveDelivery, repoPath, type SiteAdapter } from "../src/intake";
import { EXPECTATIONS, SITE_ID, buildRelease, clone } from "./fixtures";

/** A minimal site: stores the evidence and one page file per delivery, forbids one word. */
function toyAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    siteId: SITE_ID,
    review: (verified) =>
      readableText(verified.delivery.contentDocument).some((t) => /interdit/i.test(t)) ? ["the page would say a forbidden word"] : [],
    plan: (verified) => {
      const slug = verified.delivery.contentDocument.identity.slug;
      return [
        { path: repoPath("deliveries", slug, "evidence.json"), content: serializeEvidence(verified.evidence) },
        { path: repoPath("deliveries", slug, "page.txt"), content: `${verified.delivery.contentDocument.identity.title}\n` },
      ];
    },
    ...overrides,
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "textos-intake-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const evidencePath = () => join(root, "deliveries", "exemple-de-guide", "evidence.json");

describe("receiveDelivery", () => {
  it("writes a verified delivery, then finds it unchanged on a second run", () => {
    const first = receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(first.outcome).toBe("written");
    expect(first.files.map((f) => f.action)).toEqual(["create", "create"]);
    expect(readFileSync(join(root, "deliveries", "exemple-de-guide", "page.txt"), "utf8")).toBe("Exemple de guide\n");

    const second = receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(second.outcome).toBe("unchanged");
  });

  it("writes nothing when the chain does not verify", () => {
    const evidence = clone(buildRelease());
    evidence.decision.status = "rejected";
    const report = receiveDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(report.outcome).toBe("refused");
    expect(report.failures.map((f) => f.code)).toContain("decision_not_approved");
    expect(existsSync(evidencePath())).toBe(false);
  });

  it("writes nothing when the site's own rules refuse the delivery", () => {
    const evidence = buildRelease({ delivery: (d) => (d.contentDocument.identity.title = "Un mot interdit") });
    const report = receiveDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(report).toMatchObject({ outcome: "refused", violations: ["the page would say a forbidden word"] });
    expect(existsSync(evidencePath())).toBe(false);
  });

  it("never overwrites: one conflicting file refuses every write", () => {
    receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    const pagePath = join(root, "deliveries", "exemple-de-guide", "page.txt");
    writeFileSync(pagePath, "edited by hand\n");
    rmSync(evidencePath());
    const report = receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(report.outcome).toBe("refused");
    expect(report.violations[0]).toMatch(/page\.txt already exists with other content/);
    expect(existsSync(evidencePath())).toBe(false);
    expect(readFileSync(pagePath, "utf8")).toBe("edited by hand\n");
  });

  it("plans without writing on a dry run", () => {
    const report = receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter(), root, dryRun: true });
    expect(report.outcome).toBe("planned");
    expect(existsSync(evidencePath())).toBe(false);
  });

  it("refuses an adapter that plans outside the repository", () => {
    const escaping = toyAdapter({ plan: () => [{ path: "../outside.txt", content: "x" }] });
    expect(() => receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: escaping, root })).toThrow(/not a plain repository-relative path/);
    const absolute = toyAdapter({ plan: () => [{ path: "/etc/x", content: "x" }] });
    expect(() => receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: absolute, root })).toThrow(/repository-relative/);
  });

  it("refuses an adapter written for another site", () => {
    const report = receiveDelivery({ evidence: buildRelease(), expectations: EXPECTATIONS, adapter: toyAdapter({ siteId: "other-site" }), root });
    expect(report.outcome).toBe("refused");
  });
});

describe("checkCommittedDelivery", () => {
  it("passes on exactly what the intake wrote, and names any drift", () => {
    const evidence = buildRelease();
    receiveDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(checkCommittedDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root }).problems).toEqual([]);

    writeFileSync(join(root, "deliveries", "exemple-de-guide", "page.txt"), "Exemple de guide, retouché\n");
    expect(checkCommittedDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root }).problems).toEqual([
      "deliveries/exemple-de-guide/page.txt differs from what the intake writes for this delivery",
    ]);
  });

  it("re-verifies the chain from the stored evidence", () => {
    const evidence = clone(buildRelease());
    receiveDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    evidence.grant!.source = "policy";
    const { problems } = checkCommittedDelivery({ evidence, expectations: EXPECTATIONS, adapter: toyAdapter(), root });
    expect(problems.some((p) => p.startsWith("grant_mismatch"))).toBe(true);
  });
});
