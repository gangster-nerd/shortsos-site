import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { receiveDelivery } from "../packages/textos-intake/src/index";
import { EXPECTATIONS, SCHEMA_FINGERPRINT, SITE_ID, WORKSPACE_ID, buildRelease, type ReleaseOptions } from "../packages/textos-intake/test/fixtures";
import { apiIntakeExpectations, readApiIntakeConfig, shortsosAdapter, verifyCommittedReleases } from "../src/lib/textos/api-intake";
import { readBriefs } from "../src/lib/textos/articles";

const REPO_ROOT = resolve(import.meta.dirname, "..");

describe("the committed API intake configuration", () => {
  it("names this site, serves its language, and every committed release re-verifies", () => {
    const config = readApiIntakeConfig(REPO_ROOT);
    expect(config.siteId).toBe("shortsos-site");
    expect(config.locales).toContain("en-US");
    expect(verifyCommittedReleases(REPO_ROOT).problems).toEqual([]);
  });
});

/**
 * A copy of this site's textos/ folder with a workspace assigned — to the SYNTHETIC fixture
 * workspace, site id and schema fingerprint — so the adapter runs against the real briefs.
 */
let root: string;
function assign(locales: string[]): void {
  const configPath = join(root, "textos", "client", "api-intake.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  writeFileSync(configPath, JSON.stringify({ ...config, siteId: SITE_ID, workspaceId: WORKSPACE_ID, locales }, null, 2));
  const toolPath = join(root, "textos", "tool.json");
  const tool = JSON.parse(readFileSync(toolPath, "utf8")) as { contentDocumentContract: { fingerprint: string } };
  tool.contentDocumentContract.fingerprint = SCHEMA_FINGERPRINT;
  writeFileSync(toolPath, JSON.stringify(tool, null, 2));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shortsos-api-intake-"));
  cpSync(join(REPO_ROOT, "textos"), join(root, "textos"), { recursive: true });
  assign(["en-US", "fr-FR"]);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function receive(options: ReleaseOptions = {}) {
  const expectations = apiIntakeExpectations(root)!;
  return receiveDelivery({ evidence: buildRelease(options), expectations, adapter: shortsosAdapter(root, expectations.siteId), root });
}

const releaseDir = () => join(root, "textos", "api", "exemple-de-guide");

describe("receiving a release into ShortsOS", () => {
  it("receives nothing while no workspace is assigned", () => {
    const configPath = join(root, "textos", "client", "api-intake.json");
    writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, "utf8")), workspaceId: null }));
    expect(apiIntakeExpectations(root)).toBeNull();
  });

  it("keeps exactly the evidence and an intake record, which the build re-verifies", () => {
    expect(apiIntakeExpectations(root)).toEqual({ ...EXPECTATIONS, locales: ["en-US", "fr-FR"] });
    const report = receive();
    expect(report.outcome).toBe("written");
    expect(report.files.map((f) => f.path)).toEqual(["textos/api/exemple-de-guide/evidence.json", "textos/api/exemple-de-guide/intake.json"]);

    const record = JSON.parse(readFileSync(join(releaseDir(), "intake.json"), "utf8")) as Record<string, unknown>;
    expect(record).toMatchObject({
      siteId: SITE_ID,
      slug: "exemple-de-guide",
      receivedOn: "2026-10-01",
      release: { contract: "textos-headless-delivery@1", contentDraftId: "draft_1", locale: "fr-FR", title: "Exemple de guide" },
      approval: { decisionId: "dec_1", approvedAt: "2026-10-01T10:00:00.000Z" },
    });
    expect(readFileSync(join(releaseDir(), "evidence.json"), "utf8")).not.toMatch(/svc_site_fixture|user_reviewer_fixture/);

    const committed = verifyCommittedReleases(root);
    expect(committed.problems).toEqual([]);
    expect(committed.releases).toEqual([
      { slug: "exemple-de-guide", title: "Exemple de guide", locale: "fr-FR", approvedAt: "2026-10-01T10:00:00.000Z", engineSha: expect.any(String) },
    ]);
  });

  it("refuses a French release while the site publishes English only", () => {
    assign(["en-US"]);
    const report = receive();
    expect(report.outcome).toBe("refused");
    expect(report.failures.map((f) => f.code)).toEqual(["locale_not_served"]);
    expect(existsSync(releaseDir())).toBe(false);
  });

  it("refuses a slug that is already an insights article", () => {
    const taken = readBriefs(root)[0]!.slug;
    const report = receive({ delivery: (d) => (d.contentDocument.identity.slug = taken) });
    expect(report.violations).toEqual([`slug ${taken} is already an insights article of this site`]);
  });

  it("refuses self-serve wording, in either language", () => {
    const report = receive({ delivery: (d) => (d.contentDocument.identity.title = "Profitez d'un essai gratuit") });
    expect(report.outcome).toBe("refused");
    expect(report.violations[0]).toMatch(/essai gratuit.*not self-serve/);
  });

  it("refuses a page that names the tool it was written with", () => {
    const report = receive({ delivery: (d) => ((d.contentDocument.body[2]!.data as { text: string }).text = "Rédigé avec TextOS.") });
    expect(report.violations).toEqual(["names the tool it was written with; pages never do"]);
  });

  it("refuses blocks an insights page does not show, and any conversion", () => {
    const report = receive({
      delivery: (d) => {
        d.contentDocument.body.push({ id: "cta", kind: "cta_slot", data: { intent: "book_demo" } });
        (d.contentDocument.conversion as { conversionAllowed: boolean }).conversionAllowed = true;
      },
    });
    expect(report.violations).toEqual([
      "block cta is a cta_slot, which an insights page does not show",
      "the document allows conversion; insights pages carry no commercial slot",
    ]);
  });
});

describe("re-verifying committed releases (content:verify)", () => {
  it("fails on a hand edit, a stray file, or a release without an assigned workspace", () => {
    receive();
    const recordPath = join(releaseDir(), "intake.json");
    writeFileSync(recordPath, readFileSync(recordPath, "utf8").replace("Exemple de guide", "Exemple retouché"));
    writeFileSync(join(releaseDir(), "content-document.json"), "{}");
    expect(verifyCommittedReleases(root).problems).toEqual([
      "textos/api/exemple-de-guide holds files the intake never writes: content-document.json",
      "textos/api/exemple-de-guide: textos/api/exemple-de-guide/intake.json differs from what the intake writes for this delivery",
    ]);

    const configPath = join(root, "textos", "client", "api-intake.json");
    writeFileSync(configPath, JSON.stringify({ ...JSON.parse(readFileSync(configPath, "utf8")), workspaceId: null }));
    expect(verifyCommittedReleases(root).problems[0]).toMatch(/no TextOS workspace is assigned/);
  });

  it("fails when the stored evidence no longer verifies", () => {
    receive();
    const evidencePath = join(releaseDir(), "evidence.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { decision: { status: string } };
    evidence.decision.status = "rejected";
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(verifyCommittedReleases(root).problems).toEqual([
      "textos/api/exemple-de-guide: decision_not_approved: decision dec_1 is rejected",
    ]);
  });
});
