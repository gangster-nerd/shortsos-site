import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSiteConfig, receiveDelivery, releaseAdapter, runIntakeCli, serializeEvidence, siteExpectations } from "../packages/textos-intake/src/index";
import { EXPECTATIONS, SCHEMA_FINGERPRINT, SITE_ID, WORKSPACE_ID, buildRelease, type ReleaseOptions } from "../packages/textos-intake/test/fixtures";
import { SHORTSOS_INTAKE_CONFIG, shortsosRules, verifyShortsosReleases } from "../src/lib/textos/api-intake";

const REPO_ROOT = resolve(import.meta.dirname, "..");

describe("the committed API intake configuration", () => {
  it("names this site, serves its language, and every committed release re-verifies", () => {
    const config = readSiteConfig(REPO_ROOT, SHORTSOS_INTAKE_CONFIG);
    expect(config.siteId).toBe("shortsos-site");
    expect(config.locales).toContain("en-US");
    expect(verifyShortsosReleases(REPO_ROOT).problems).toEqual([]);
  });
});

/**
 * A copy of this site's sources/ folder with a workspace assigned — to the SYNTHETIC fixture
 * workspace, site id and schema fingerprint — so ShortsOS's rules run on a release.
 */
let root: string;
const configPath = () => join(root, SHORTSOS_INTAKE_CONFIG);
function assign(changes: Record<string, unknown>): void {
  const config = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>;
  writeFileSync(configPath(), JSON.stringify({ ...config, ...changes }, null, 2));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shortsos-api-intake-"));
  cpSync(join(REPO_ROOT, "sources"), join(root, "sources"), { recursive: true });
  assign({ siteId: SITE_ID, workspaceId: WORKSPACE_ID, locales: ["en-US", "fr-FR"], contentDocumentFingerprint: SCHEMA_FINGERPRINT });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function receive(options: ReleaseOptions = {}) {
  const config = readSiteConfig(root, SHORTSOS_INTAKE_CONFIG);
  return receiveDelivery({ evidence: buildRelease(options), expectations: siteExpectations(config)!, adapter: releaseAdapter(config, shortsosRules()), root });
}

const releaseDir = () => join(root, "textos", "api", "exemple-de-guide");

describe("receiving a release into ShortsOS", () => {
  it("receives nothing while no workspace is assigned", () => {
    assign({ workspaceId: null });
    expect(siteExpectations(readSiteConfig(root, SHORTSOS_INTAKE_CONFIG))).toBeNull();
  });

  it("keeps exactly the evidence and an intake record, which the build re-verifies", () => {
    expect(siteExpectations(readSiteConfig(root, SHORTSOS_INTAKE_CONFIG))).toEqual({ ...EXPECTATIONS, locales: ["en-US", "fr-FR"] });
    const report = receive();
    expect(report.outcome).toBe("written");
    expect(report.files.map((f) => f.path)).toEqual(["textos/api/exemple-de-guide/evidence.json", "textos/api/exemple-de-guide/intake.json"]);

    const record = JSON.parse(readFileSync(join(releaseDir(), "intake.json"), "utf8")) as Record<string, unknown>;
    expect(record).toMatchObject({
      recordVersion: "textos-intake-record@1",
      siteId: SITE_ID,
      slug: "exemple-de-guide",
      receivedOn: "2026-10-01",
      release: { contract: "textos-headless-delivery@1", contentDraftId: "draft_1", locale: "fr-FR", title: "Exemple de guide" },
      approval: { decisionId: "dec_1", approvedAt: "2026-10-01T10:00:00.000Z" },
    });
    expect(readFileSync(join(releaseDir(), "evidence.json"), "utf8")).not.toMatch(/svc_site_fixture|user_reviewer_fixture/);

    const committed = verifyShortsosReleases(root);
    expect(committed.problems).toEqual([]);
    expect(committed.releases).toEqual([
      {
        slug: "exemple-de-guide",
        title: "Exemple de guide",
        locale: "fr-FR",
        approvedAt: "2026-10-01T10:00:00.000Z",
        engineSha: expect.any(String),
        artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    ]);
  });

  it("runs as ShortsOS's command: replay writes the release, check re-verifies it", async () => {
    const evidenceFile = join(root, "release-evidence.json");
    writeFileSync(evidenceFile, serializeEvidence(buildRelease()));
    const lines: string[] = [];
    const options = { root, configPath: SHORTSOS_INTAKE_CONFIG, rules: shortsosRules(), stdout: (l: string) => lines.push(l), stderr: (l: string) => lines.push(l) };
    expect(await runIntakeCli(["replay", "--evidence", evidenceFile], options)).toBe(0);
    expect(await runIntakeCli(["check"], options)).toBe(0);
    expect(lines).toContain("outcome: written");
    expect(lines.at(-1)).toBe("check: 1 release(s) re-verified, 0 problem(s)");
  });

  it("refuses a French release while the site publishes English only", () => {
    assign({ locales: ["en-US"] });
    const report = receive();
    expect(report.outcome).toBe("refused");
    expect(report.failures.map((f) => f.code)).toEqual(["locale_not_served"]);
    expect(existsSync(releaseDir())).toBe(false);
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

  it("refuses blocks a page of this site does not show, and any conversion", () => {
    const report = receive({
      delivery: (d) => {
        d.contentDocument.body.push({ id: "cta", kind: "cta_slot", data: { intent: "book_demo" } });
        (d.contentDocument.conversion as { conversionAllowed: boolean }).conversionAllowed = true;
      },
    });
    expect(report.violations).toEqual([
      "block cta is a cta_slot, which a page of this site does not show",
      "the document allows conversion; this site's pages carry no commercial slot",
    ]);
  });
});

describe("re-verifying committed releases (content:verify)", () => {
  it("fails on a hand edit, a stray file, or a release without an assigned workspace", () => {
    receive();
    const recordPath = join(releaseDir(), "intake.json");
    writeFileSync(recordPath, readFileSync(recordPath, "utf8").replace("Exemple de guide", "Exemple retouché"));
    writeFileSync(join(releaseDir(), "content-document.json"), "{}");
    expect(verifyShortsosReleases(root).problems).toEqual([
      "textos/api/exemple-de-guide: textos/api/exemple-de-guide/intake.json differs from what the intake writes for this delivery",
      "textos/api/exemple-de-guide holds files the intake never writes: content-document.json",
    ]);

    assign({ workspaceId: null });
    expect(verifyShortsosReleases(root).problems[0]).toMatch(/no TextOS workspace is assigned/);
  });

  it("fails when the stored evidence no longer verifies", () => {
    receive();
    const evidencePath = join(releaseDir(), "evidence.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { decision: { status: string } };
    evidence.decision.status = "rejected";
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(verifyShortsosReleases(root).problems).toEqual(["textos/api/exemple-de-guide: decision_not_approved: decision dec_1 is rejected"]);
  });
});
