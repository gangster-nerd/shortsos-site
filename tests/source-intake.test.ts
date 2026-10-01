import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSourceConfig, readSourceConfigs, receiveDelivery, releaseAdapter, runIntakeCli, serializeEvidence, siteExpectations } from "../packages/source-intake/src/index";
import { EXPECTATIONS, RELEASE, SCHEMA_FINGERPRINT, SITE_ID, WORKSPACE_ID, buildRelease, type ReleaseOptions } from "../packages/source-intake/test/fixtures";
import { SOURCES_DIR, siteRules, verifyReceivedReleases } from "../src/lib/sources/intake";

const REPO_ROOT = resolve(import.meta.dirname, "..");

describe("the committed sources", () => {
  it("are TextOS alone: it names this site, serves its language, and every committed release re-verifies", () => {
    expect(readSourceConfigs(REPO_ROOT, SOURCES_DIR).map((c) => c.source)).toEqual(["textos"]);
    const config = readSourceConfig(REPO_ROOT, SOURCES_DIR, "textos");
    expect(config.siteId).toBe("shortsos-site");
    expect(config.locales).toContain("en-US");
    expect(config.release.capability.startsWith("textos.")).toBe(true);
    expect(verifyReceivedReleases(REPO_ROOT)).toEqual({ releases: [], problems: [] });
  });

  it("receive nothing while no workspace is assigned", () => {
    expect(siteExpectations(readSourceConfig(REPO_ROOT, SOURCES_DIR, "textos"))).toBeNull();
  });
});

/**
 * A copy of this site's sources/ folder with the TextOS configuration pointed at the SYNTHETIC
 * fixture release — its workspace, site id, release names and schema fingerprint — so ShortsOS's
 * rules run on a release. Nothing here was received from TextOS.
 */
let root: string;
const configPath = () => join(root, SOURCES_DIR, "textos.json");
function assign(changes: Record<string, unknown>): void {
  const config = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>;
  writeFileSync(configPath(), JSON.stringify({ ...config, ...changes }, null, 2));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shortsos-source-intake-"));
  cpSync(join(REPO_ROOT, SOURCES_DIR), join(root, SOURCES_DIR), { recursive: true });
  assign({ siteId: SITE_ID, workspaceId: WORKSPACE_ID, release: RELEASE, locales: ["en-US", "fr-FR"], contentDocumentFingerprint: SCHEMA_FINGERPRINT });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const config = () => readSourceConfig(root, SOURCES_DIR, "textos");
function receive(options: ReleaseOptions = {}) {
  return receiveDelivery({ evidence: buildRelease(options), expectations: siteExpectations(config())!, adapter: releaseAdapter(config(), siteRules(config())), root });
}

const releaseDir = () => join(root, "content", "releases", "textos", "exemple-de-guide");

describe("receiving a release into ShortsOS", () => {
  it("keeps exactly the evidence and an intake record, which the build re-verifies", () => {
    expect(siteExpectations(config())).toEqual({ ...EXPECTATIONS, locales: ["en-US", "fr-FR"] });
    const report = receive();
    expect(report.outcome).toBe("written");
    expect(report.files.map((f) => f.path)).toEqual(["content/releases/textos/exemple-de-guide/evidence.json", "content/releases/textos/exemple-de-guide/intake.json"]);

    const record = JSON.parse(readFileSync(join(releaseDir(), "intake.json"), "utf8")) as Record<string, unknown>;
    expect(record).toMatchObject({
      recordVersion: "source-intake-record@1",
      source: "textos",
      siteId: SITE_ID,
      slug: "exemple-de-guide",
      receivedOn: "2026-10-01",
      release: { contract: RELEASE.deliveryContract, contentDraftId: "draft_1", locale: "fr-FR", title: "Exemple de guide" },
      approval: { decisionId: "dec_1", approvedAt: "2026-10-01T10:00:00.000Z" },
    });
    expect(readFileSync(join(releaseDir(), "evidence.json"), "utf8")).not.toMatch(/svc_site_fixture|user_reviewer_fixture/);

    const committed = verifyReceivedReleases(root);
    expect(committed.problems).toEqual([]);
    expect(committed.releases).toEqual([
      {
        source: "textos",
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
    const options = { root, sourcesDir: SOURCES_DIR, rules: siteRules, stdout: (l: string) => lines.push(l), stderr: (l: string) => lines.push(l) };
    expect(await runIntakeCli(["replay", "--source", "textos", "--evidence", evidenceFile], options)).toBe(0);
    expect(await runIntakeCli(["check"], options)).toBe(0);
    expect(lines).toContain("outcome: written");
    expect(lines).toContain("  verified  textos/exemple-de-guide (fr-FR, approved 2026-10-01T10:00:00.000Z)");
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

  it("refuses a page that names the source it was released by", () => {
    const report = receive({ delivery: (d) => ((d.contentDocument.body[2]!.data as { text: string }).text = "Rédigé avec TextOS.") });
    expect(report.violations).toEqual(["names textos, the source it was released by; pages never do"]);
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
    expect(verifyReceivedReleases(root).problems).toEqual([
      "content/releases/textos/exemple-de-guide: content/releases/textos/exemple-de-guide/intake.json differs from what the intake writes for this delivery",
      "content/releases/textos/exemple-de-guide holds files the intake never writes: content-document.json",
    ]);

    assign({ workspaceId: null });
    expect(verifyReceivedReleases(root).problems[0]).toMatch(/no workspace of source textos is assigned/);
  });

  it("fails when the stored evidence no longer verifies", () => {
    receive();
    const evidencePath = join(releaseDir(), "evidence.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { decision: { status: string } };
    evidence.decision.status = "rejected";
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(verifyReceivedReleases(root).problems).toEqual(["content/releases/textos/exemple-de-guide: decision_not_approved: decision dec_1 is rejected"]);
  });
});
