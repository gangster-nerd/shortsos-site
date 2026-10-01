/**
 * The two API gestures of a release, from the site's side:
 *
 *   1. `requestRelease` — ask the source for a human Decision on releasing one content draft to
 *      this site. The source derives the exact action (and the hash of the content it would
 *      release); a person approves or rejects it there. Nothing is released yet.
 *   2. `collectRelease` — once approved, run the release under the grant that approval issued,
 *      wait for the job, and read back the artifact, its receipt and the decision: the evidence a
 *      site verifies and keeps.
 *
 * Both run with the site's own service token: the API lets only the principal that requested a
 * decision (or invoked a job) read it back, so the site must be the one asking.
 */
import type { ApiJob, JobView } from "./api-types";
import type { SourceApiClient } from "./client";
import type { ReleaseContract } from "./delivery";
import { assembleEvidence, type IntakeEvidence } from "./evidence";

export class IntakeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeRefusedError";
  }
}

export interface ReleaseRequest {
  workspaceId: string;
  siteId: string;
  release: ReleaseContract;
  contentDraftId: string;
}

/** Payload of the release capability: which draft, to which site. */
export function releasePayload(input: { siteId: string; contentDraftId: string; release: ReleaseContract }) {
  return { contentDraftId: input.contentDraftId, destination: { kind: input.release.targetKind, siteId: input.siteId } };
}

export async function requestRelease(client: SourceApiClient, input: ReleaseRequest) {
  const response = await client.requestDecision(
    input.workspaceId,
    { capabilityId: input.release.capability, payload: releasePayload(input) },
    `${input.siteId}:release-decision:${input.contentDraftId}`,
  );
  return {
    decisionId: response.decision.id,
    status: response.decision.status,
    actionEnvelopeHash: response.decision.actionEnvelopeHash,
    expiresAt: response.decision.expiresAt,
    resolvePath: response.links?.resolve ?? null,
  };
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const TERMINAL_FAILURES: ApiJob["status"][] = ["failed", "canceled", "input_required"];

export async function waitForJob(client: SourceApiClient, workspaceId: string, jobId: string, options: WaitOptions = {}): Promise<JobView> {
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 2000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  for (;;) {
    const view = await client.job(workspaceId, jobId);
    if (view.job.status === "succeeded") return view;
    if (TERMINAL_FAILURES.includes(view.job.status)) {
      throw new IntakeRefusedError(`release job ${jobId} stopped: ${view.job.status}${view.job.failureCode ? ` (${view.job.failureCode})` : ""}`);
    }
    if (now() >= deadline) throw new IntakeRefusedError(`release job ${jobId} still ${view.job.status} after ${Math.round(timeoutMs / 1000)} s — collect it later with its job id`);
    await sleep(intervalMs);
  }
}

export interface CollectInput {
  workspaceId: string;
  siteId: string;
  release: ReleaseContract;
  decisionId: string;
  /** Resume a release already started (e.g. after a timeout) instead of invoking it. */
  jobId?: string;
  collectedAt: () => string;
  wait?: WaitOptions;
}

export async function collectRelease(client: SourceApiClient, input: CollectInput): Promise<IntakeEvidence> {
  const capability = input.release.capability;
  const before = await client.decision(input.workspaceId, input.decisionId);
  if (before.decision.status !== "approved" || !before.grant) {
    throw new IntakeRefusedError(`decision ${input.decisionId} is ${before.decision.status}; a release runs only after a person approved it in the source`);
  }

  let jobId = input.jobId;
  if (!jobId) {
    // The idempotency key makes a re-run replay the same job instead of releasing twice.
    const accepted = await client.invoke(
      input.workspaceId,
      { capabilityId: capability, trustGrantId: before.grant.id, payload: before.executionPayload },
      `${input.siteId}:release:${input.decisionId}`,
    );
    if (accepted.kind !== "job" || !("job" in accepted)) throw new IntakeRefusedError(`${capability} did not start a durable job`);
    jobId = accepted.job.id;
  }

  const terminal = await waitForJob(client, input.workspaceId, jobId, input.wait);
  const artifactId = terminal.job.outputArtifactId ?? terminal.job.artifactId;
  const receiptId = terminal.job.receiptId;
  if (!artifactId || !receiptId) throw new IntakeRefusedError(`release job ${jobId} succeeded without an artifact and a receipt`);
  const [artifact, receipt] = await Promise.all([client.artifact(input.workspaceId, artifactId), client.receipt(input.workspaceId, receiptId)]);
  // Read the decision again: its grant now records that the release used it.
  const after = await client.decision(input.workspaceId, input.decisionId);

  return assembleEvidence({ collectedAt: input.collectedAt(), job: terminal.job, artifact, receipt, decision: after });
}
