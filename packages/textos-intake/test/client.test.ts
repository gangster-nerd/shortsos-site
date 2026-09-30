import { describe, expect, it } from "vitest";

import { TextosApiError, createTextosApiClient } from "../src/client";
import { IntakeRefusedError, collectRelease, requestRelease, waitForJob } from "../src/collect";
import { RELEASE_CAPABILITY } from "../src/delivery";
import { verifyEvidence } from "../src/verify";
import { EXPECTATIONS, SITE_ID, WORKSPACE_ID, buildReleaseRecords, clone } from "./fixtures";

const TOKEN = "txos_v1_fixture_secret_token";
const BASE = "https://textos.example";

interface Call {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

type Route = (call: Call) => { status: number; body: unknown } | undefined;

/** An in-memory stand-in for the API: routes answer calls, every call is recorded. */
function fakeApi(route: Route) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = route(call) ?? { status: 404, body: { type: "urn:textos:problem:not_found", title: "Resource not found", status: 404, code: "not_found" } };
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    return new Response(text, { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, client: createTextosApiClient({ baseUrl: `${BASE}/`, token: TOKEN, fetch: fetchImpl }) };
}

const ws = `/api/v1/workspaces/${WORKSPACE_ID}`;

describe("TextOS API client", () => {
  it("authenticates, traces and keys writes like the API's own tooling", async () => {
    const { calls, client } = fakeApi(() => ({ status: 200, body: { decision: { id: "dec_1", status: "pending", actionEnvelopeHash: "h", expiresAt: "t" } } }));
    await client.requestDecision(WORKSPACE_ID, { capabilityId: "x", payload: {} }, "key-1");
    const [call] = calls;
    expect(call!.method).toBe("POST");
    expect(call!.path).toBe(`${ws}/decisions`);
    expect(call!.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(call!.headers.get("idempotency-key")).toBe("key-1");
    expect(call!.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("turns problem details into a typed error", async () => {
    const { client } = fakeApi(() => undefined);
    const error = await client.job(WORKSPACE_ID, "job_x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TextosApiError);
    expect((error as TextosApiError).notFound).toBe(true);
    expect((error as TextosApiError).message).toContain("not_found");
  });

  it("refuses a response that echoes the token, and a non-JSON response", async () => {
    const echo = fakeApi(() => ({ status: 200, body: { note: `your token is ${TOKEN}` } }));
    await expect(echo.client.readiness(WORKSPACE_ID)).rejects.toThrow(/echoed the bearer token/);
    const html = fakeApi(() => ({ status: 502, body: "<html>bad gateway</html>" }));
    await expect(html.client.readiness(WORKSPACE_ID)).rejects.toMatchObject({ status: 502, problem: null });
  });

  it("only talks https, or plain http to localhost", () => {
    expect(() => createTextosApiClient({ baseUrl: "http://textos.example", token: TOKEN })).toThrow(/https/);
    expect(() => createTextosApiClient({ baseUrl: "http://localhost:3000", token: TOKEN })).not.toThrow();
    expect(() => createTextosApiClient({ baseUrl: BASE, token: " " })).toThrow(/empty/);
  });
});

describe("requestRelease / collectRelease", () => {
  it("asks for a human decision on releasing one draft to this site", async () => {
    const { calls, client } = fakeApi(() => ({
      status: 201,
      body: { decision: { id: "dec_1", status: "pending", actionEnvelopeHash: "h", expiresAt: "2026-10-08T00:00:00Z" }, links: { resolve: "/r" } },
    }));
    const requested = await requestRelease(client, { workspaceId: WORKSPACE_ID, siteId: SITE_ID, contentDraftId: "draft_1" });
    expect(requested).toMatchObject({ decisionId: "dec_1", status: "pending", resolvePath: "/r" });
    expect(calls[0]!.body).toEqual({
      capabilityId: RELEASE_CAPABILITY,
      payload: { contentDraftId: "draft_1", destination: { kind: "headless_site", siteId: SITE_ID } },
    });
    expect(calls[0]!.headers.get("idempotency-key")).toBe(`${SITE_ID}:release-decision:draft_1`);
  });

  function releaseApi(options: { decisionStatus?: "approved" | "pending"; jobStatuses?: string[] } = {}) {
    const records = buildReleaseRecords();
    const statuses = [...(options.jobStatuses ?? ["queued", "running", "succeeded"])];
    const decisionView = clone(records.decisionView);
    if (options.decisionStatus === "pending") {
      decisionView.decision.status = "pending";
      delete (decisionView as { grant?: unknown }).grant;
    }
    return fakeApi((call) => {
      if (call.method === "GET" && call.path === `${ws}/decisions/dec_1`) return { status: 200, body: decisionView };
      if (call.method === "POST" && call.path === `${ws}/invoke`) {
        return { status: 202, body: { kind: "job", job: { ...records.job, status: "queued" }, links: { self: `${ws}/jobs/job_1` } } };
      }
      if (call.method === "GET" && call.path === `${ws}/jobs/job_1`) {
        const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
        return { status: 200, body: { job: { ...records.job, status }, links: {} } };
      }
      if (call.path === `${ws}/artifacts/artifact_out`) return { status: 200, body: { artifact: records.artifact } };
      if (call.path === `${ws}/receipts/receipt_1`) return { status: 200, body: { receipt: records.receipt } };
      return undefined;
    });
  }

  const noWait = { sleep: async () => {}, intervalMs: 1 };

  it("runs the approved release under its grant and returns evidence that verifies", async () => {
    const { calls, client } = releaseApi();
    const evidence = await collectRelease(client, {
      workspaceId: WORKSPACE_ID,
      siteId: SITE_ID,
      decisionId: "dec_1",
      collectedAt: () => "2026-10-01T10:06:00.000Z",
      wait: noWait,
    });
    const invoke = calls.filter((c) => c.path.endsWith("/invoke"));
    expect(invoke).toHaveLength(1);
    expect(invoke[0]!.body).toEqual({
      capabilityId: RELEASE_CAPABILITY,
      trustGrantId: "grant_1",
      payload: { contentDraftId: "draft_1", destination: { kind: "headless_site", siteId: SITE_ID } },
    });
    expect(invoke[0]!.headers.get("idempotency-key")).toBe(`${SITE_ID}:release:dec_1`);
    expect(verifyEvidence(evidence, EXPECTATIONS).ok).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("svc_site_fixture");
  });

  it("never invokes a release that no person approved", async () => {
    const { calls, client } = releaseApi({ decisionStatus: "pending" });
    await expect(
      collectRelease(client, { workspaceId: WORKSPACE_ID, siteId: SITE_ID, decisionId: "dec_1", collectedAt: () => "t", wait: noWait }),
    ).rejects.toBeInstanceOf(IntakeRefusedError);
    expect(calls.some((c) => c.path.endsWith("/invoke"))).toBe(false);
  });

  it("resumes a started release by job id without invoking it again", async () => {
    const { calls, client } = releaseApi();
    await collectRelease(client, { workspaceId: WORKSPACE_ID, siteId: SITE_ID, decisionId: "dec_1", jobId: "job_1", collectedAt: () => "t", wait: noWait });
    expect(calls.some((c) => c.path.endsWith("/invoke"))).toBe(false);
  });

  it("stops on a failed job and on a timeout", async () => {
    const failed = releaseApi({ jobStatuses: ["running", "failed"] });
    await expect(waitForJob(failed.client, WORKSPACE_ID, "job_1", noWait)).rejects.toThrow(/stopped: failed/);

    const stuck = releaseApi({ jobStatuses: ["running"] });
    let clock = 0;
    const timing = { timeoutMs: 10, intervalMs: 5, sleep: async (ms: number) => void (clock += ms), now: () => clock };
    await expect(waitForJob(stuck.client, WORKSPACE_ID, "job_1", timing)).rejects.toThrow(/still running/);
  });
});
