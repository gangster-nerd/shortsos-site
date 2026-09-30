import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serializeEvidence } from "../src/evidence";
import { parseSiteConfig, siteExpectations } from "../src/site-kit";
import { runIntakeCli } from "../src/cli";
import { siteRules } from "../template/site-rules";
import { SCHEMA_FINGERPRINT, SITE_ID, WORKSPACE_ID, buildRelease, type ReleaseOptions } from "./fixtures";

/** The templates run as shipped: a site that copies them starts from something that works. */
const TEMPLATE_DIR = join(import.meta.dirname, "..", "template");
const CONFIG = "textos-intake.config.json";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "textos-intake-template-"));
  copyFileSync(join(TEMPLATE_DIR, CONFIG), join(root, CONFIG));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function assignSyntheticWorkspace(): void {
  const config = JSON.parse(readFileSync(join(root, CONFIG), "utf8")) as Record<string, unknown>;
  writeFileSync(join(root, CONFIG), JSON.stringify({ ...config, siteId: SITE_ID, workspaceId: WORKSPACE_ID, contentDocumentFingerprint: SCHEMA_FINGERPRINT }));
}

async function run(argv: string[], options: ReleaseOptions = {}) {
  const lines: string[] = [];
  const file = join(root, "evidence-in.json");
  writeFileSync(file, serializeEvidence(buildRelease(options)));
  const code = await runIntakeCli(argv.map((a) => (a === "<evidence>" ? file : a)), {
    root,
    configPath: CONFIG,
    rules: siteRules({ takenSlugs: () => ["deja-publie"] }),
    stdout: (l) => lines.push(l),
    stderr: (l) => lines.push(l),
  });
  return { code, lines };
}

describe("the adoption templates", () => {
  it("ship a valid configuration that receives nothing until a workspace is assigned", async () => {
    const parsed = parseSiteConfig(JSON.parse(readFileSync(join(TEMPLATE_DIR, CONFIG), "utf8")));
    expect(parsed.problems).toEqual([]);
    expect(siteExpectations(parsed.config!)).toBeNull();
    const { code, lines } = await run(["replay", "--evidence", "<evidence>"]);
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/no TextOS workspace is assigned to my-site/);
  });

  it("receive a release into content/textos-api/<slug>/ and re-verify it", async () => {
    assignSyntheticWorkspace();
    expect((await run(["replay", "--evidence", "<evidence>"])).code).toBe(0);
    expect(existsSync(join(root, "content", "textos-api", "exemple-de-guide", "evidence.json"))).toBe(true);
    const { code, lines } = await run(["check"]);
    expect(code).toBe(0);
    expect(lines.at(-1)).toBe("check: 1 release(s) re-verified, 0 problem(s)");
  });

  it("apply the template rules: a taken slug is refused", async () => {
    assignSyntheticWorkspace();
    const { code, lines } = await run(["replay", "--evidence", "<evidence>"], { delivery: (d) => (d.contentDocument.identity.slug = "deja-publie") });
    expect(code).toBe(1);
    expect(lines).toContain("  refused — slug deja-publie is already a page of this site");
  });

  it("answer a usage error with the usage", async () => {
    const { code, lines } = await run(["publish"]);
    expect(code).toBe(2);
    expect(lines.join("\n")).toMatch(/unknown command "publish"[\s\S]*usage:/);
  });
});
