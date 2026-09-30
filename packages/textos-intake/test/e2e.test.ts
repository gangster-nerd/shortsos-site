import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runIntakeCli } from "../src/cli";
import { noConversion } from "../src/rules";
import { SCHEMA_FINGERPRINT, SITE_ID, WORKSPACE_ID, buildReleaseRecords, clone } from "./fixtures";

/**
 * The whole command over real HTTP: a local stand-in for the TextOS API serves one SYNTHETIC
 * release (test/fixtures.ts) the way the V1.1 routes answer, and the command runs against it
 * with Node's own fetch. Nothing here reaches TextOS.
 */
const TOKEN = "txos_v1_e2e_token";
const ws = `/api/v1/workspaces/${WORKSPACE_ID}`;

interface Call {
  method: string;
  path: string;
  authorization: string | undefined;
  idempotencyKey: string | undefined;
  body: unknown;
}

const records = buildReleaseRecords();
const calls: Call[] = [];
let invoked = false;
let polls = 0;
let server: Server;
let base: string;
let root: string;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const text = await readBody(req);
    const call: Call = {
      method: req.method ?? "",
      path: req.url ?? "",
      authorization: req.headers.authorization,
      idempotencyKey: req.headers["idempotency-key"] as string | undefined,
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const problem = (status: number, code: string) => send(status, { type: `urn:textos:problem:${code}`, title: code, status, code });

    if (call.authorization !== `Bearer ${TOKEN}`) return problem(401, "invalid_bearer_token");
    if (call.method === "GET" && call.path === `${ws}/decisions/dec_1`) {
      // Before the release the grant is active; the release consumes it.
      const view = clone(records.decisionView);
      view.grant.status = invoked ? "consumed" : "active";
      return send(200, view);
    }
    if (call.method === "POST" && call.path === `${ws}/invoke`) {
      invoked = true;
      return send(202, { kind: "job", job: { ...records.job, status: "queued" }, links: { self: `${ws}/jobs/job_1` } });
    }
    if (call.method === "GET" && call.path === `${ws}/jobs/job_1`) {
      polls += 1;
      return send(200, { job: { ...records.job, status: polls < 2 ? "running" : "succeeded" }, links: {} });
    }
    if (call.method === "GET" && call.path === `${ws}/artifacts/artifact_out`) return send(200, { artifact: records.artifact });
    if (call.method === "GET" && call.path === `${ws}/receipts/receipt_1`) return send(200, { receipt: records.receipt });
    // Everything else — including POST /decisions for the proposed capability — is not served.
    return problem(404, "not_found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  root = mkdtempSync(join(tmpdir(), "textos-intake-e2e-"));
  writeFileSync(
    join(root, "intake.config.json"),
    JSON.stringify({
      configVersion: "textos-intake-config@1",
      siteId: SITE_ID,
      workspaceId: WORKSPACE_ID,
      locales: ["fr-FR"],
      contentDocumentFingerprint: SCHEMA_FINGERPRINT,
      acceptedEngineShas: "any",
      releasesDir: "releases",
    }),
  );
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

async function cli(argv: string[], token = TOKEN) {
  const lines: string[] = [];
  const code = await runIntakeCli(argv, {
    root,
    configPath: "intake.config.json",
    rules: { review: noConversion() },
    env: { TEXTOS_API_BASE_URL: base, TEXTOS_API_TOKEN: token },
    now: () => new Date("2026-10-01T10:06:00.000Z"),
    wait: { intervalMs: 1, sleep: async () => {} },
    stdout: (line) => lines.push(line),
    stderr: (line) => lines.push(line),
  });
  return { code, text: lines.join("\n") };
}

const evidencePath = () => join(root, "releases", "exemple-de-guide", "evidence.json");

describe("the intake command against a local stand-in API", () => {
  it("request: explains the not_found an API without the release capability answers", async () => {
    const { code, text } = await cli(["request", "--content-draft", "draft_1"]);
    expect(code).toBe(1);
    expect(text).toMatch(/HTTP 404 .* not_found[\s\S]*still a proposal/);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: `${ws}/decisions`, idempotencyKey: `${SITE_ID}:release-decision:draft_1` });
  });

  it("receive: runs the approved release once, under its grant, and writes what verifies", async () => {
    const { code, text } = await cli(["receive", "--decision", "dec_1"]);
    expect(code).toBe(0);
    expect(text).toContain("outcome: written");
    const invokes = calls.filter((c) => c.path === `${ws}/invoke`);
    expect(invokes).toHaveLength(1);
    expect(invokes[0]).toMatchObject({
      idempotencyKey: `${SITE_ID}:release:dec_1`,
      body: { capabilityId: "textos.release_headless_delivery@1", trustGrantId: "grant_1", payload: records.decisionView.executionPayload },
    });
    const stored = readFileSync(evidencePath(), "utf8");
    expect(stored).toContain('"status": "consumed"');
    expect(stored).not.toMatch(/svc_site_fixture|user_reviewer_fixture/);
  });

  it("receive --job: resumes without invoking again, and finds the files unchanged", async () => {
    const before = calls.filter((c) => c.path === `${ws}/invoke`).length;
    const { code, text } = await cli(["receive", "--decision", "dec_1", "--job", "job_1"]);
    expect(code).toBe(0);
    expect(text).toContain("outcome: unchanged");
    expect(calls.filter((c) => c.path === `${ws}/invoke`)).toHaveLength(before);
  });

  it("check: passes on what was written, fails once the stored evidence is tampered with", async () => {
    expect((await cli(["check"])).code).toBe(0);
    const evidence = JSON.parse(readFileSync(evidencePath(), "utf8")) as { decision: { status: string } };
    evidence.decision.status = "rejected";
    writeFileSync(evidencePath(), `${JSON.stringify(evidence, null, 2)}\n`);
    const { code, text } = await cli(["check"]);
    expect(code).toBe(1);
    expect(text).toContain("decision_not_approved");
  });

  it("sends the token only as a bearer header, and stops on a refused token", async () => {
    expect(calls.every((c) => !c.path.includes(TOKEN))).toBe(true);
    const { code, text } = await cli(["receive", "--decision", "dec_1"], "txos_v1_wrong");
    expect(code).toBe(1);
    expect(text).toMatch(/HTTP 401 .* invalid_bearer_token/);
  });
});
