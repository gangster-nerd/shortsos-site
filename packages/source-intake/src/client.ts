/**
 * Thin client for the REST routes of a source's API that a site needs: bearer service token, W3C
 * `traceparent`, `Idempotency-Key` on writes, problem details on errors, and a refusal to go on if
 * a response ever echoes the token. Redirects are refused so the token is never replayed to
 * another host.
 */
import { randomBytes } from "node:crypto";

import type { ApiArtifact, ApiProblem, ApiReceipt, DecisionView, JobView } from "./api-types";
import { isObject } from "./shape";

export class SourceApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem | null,
    readonly path: string,
    source = "source",
  ) {
    super(`${source} API HTTP ${status} on ${path}${problem ? ` — ${problem.code ?? problem.title}${problem.detail ? `: ${problem.detail}` : ""}` : ""}`);
    this.name = "SourceApiError";
  }

  /**
   * 404 `not_found` — which the API also answers for a capability it does not serve over REST,
   * and for a resource another principal owns.
   */
  get notFound(): boolean {
    return this.status === 404;
  }
}

export interface SourceApiClientOptions {
  baseUrl: string;
  token: string;
  /** The source's id, for messages. */
  source?: string;
  fetch?: typeof fetch;
}

export interface InvokeRequest {
  capabilityId: string;
  payload: unknown;
  trustGrantId?: string;
}

/** `POST …/invoke` of an async capability → a durable job. */
export interface InvokeJobResponse {
  kind: "job";
  job: JobView["job"];
  links: { self: string };
}

export interface DecisionRequestResponse {
  decision: DecisionView["decision"];
  links?: { resolve?: string };
}

function isProblem(value: unknown): value is ApiProblem {
  return isObject(value) && typeof value.type === "string" && typeof value.status === "number";
}

function traceparent(): string {
  return `00-${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-01`;
}

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createSourceApiClient(options: SourceApiClientOptions) {
  const source = options.source ?? "source";
  const root = options.baseUrl.replace(/\/+$/, "");
  if (!root.startsWith("https://") && !LOCAL_HTTP.test(root)) {
    throw new Error(`${source} API base URL must use https (plain http only for a localhost server)`);
  }
  if (!options.token.trim()) throw new Error(`${source} API token is empty`);
  const doFetch = options.fetch ?? fetch;
  const ws = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

  async function request<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    if (!path.startsWith("/api/v1/workspaces/")) throw new Error(`refusing to call ${path}: not an API v1 workspace route`);
    const response = await doFetch(`${root}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${options.token}`,
        accept: "application/json",
        traceparent: traceparent(),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      redirect: "error",
    });
    const text = await response.text();
    if (text.includes(options.token)) throw new Error(`security invariant failed: the ${source} API response echoed the bearer token`);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new SourceApiError(response.status, null, path, source);
    }
    if (!response.ok) throw new SourceApiError(response.status, isProblem(body) ? body : null, path, source);
    return body as T;
  }

  return {
    readiness: (workspaceId: string) => request<Record<string, unknown>>(`${ws(workspaceId)}/readiness`),
    job: (workspaceId: string, jobId: string) => request<JobView>(`${ws(workspaceId)}/jobs/${encodeURIComponent(jobId)}`),
    artifact: async (workspaceId: string, artifactId: string) =>
      (await request<{ artifact: ApiArtifact }>(`${ws(workspaceId)}/artifacts/${encodeURIComponent(artifactId)}`)).artifact,
    receipt: async (workspaceId: string, receiptId: string) =>
      (await request<{ receipt: ApiReceipt }>(`${ws(workspaceId)}/receipts/${encodeURIComponent(receiptId)}`)).receipt,
    decision: (workspaceId: string, decisionId: string) => request<DecisionView>(`${ws(workspaceId)}/decisions/${encodeURIComponent(decisionId)}`),
    requestDecision: (workspaceId: string, input: { capabilityId: string; payload: unknown }, idempotencyKey: string) =>
      request<DecisionRequestResponse>(`${ws(workspaceId)}/decisions`, { method: "POST", body: input, idempotencyKey }),
    invoke: (workspaceId: string, input: InvokeRequest, idempotencyKey: string) =>
      request<InvokeJobResponse | { kind: string }>(`${ws(workspaceId)}/invoke`, { method: "POST", body: input, idempotencyKey }),
  };
}

export type SourceApiClient = ReturnType<typeof createSourceApiClient>;
