#!/usr/bin/env tsx
/**
 * `npm run textos:intake -- <command> [options]` — the site's door for content released by the
 * TextOS API (see packages/textos-intake/README.md and textos/README.md, "Receiving from the
 * TextOS API").
 *
 *   request --content-draft <id>             Ask TextOS for a human decision on releasing that
 *                                            draft to this site. Prints the decision id; a
 *                                            person approves or rejects it in TextOS.
 *   receive --decision <id> [--job <id>]     After approval: run the release under its grant,
 *           [--dry-run]                      verify everything, write textos/api/<slug>/.
 *                                            `--job` resumes a release already started.
 *   replay --evidence <file> [--dry-run]     Verify and write a release from evidence already
 *                                            collected (textos-intake-evidence@1), offline.
 *
 * `request` and `receive` read TEXTOS_API_BASE_URL and TEXTOS_API_TOKEN from the environment —
 * the same names as TextOS's own API scripts. The workspace comes from the committed
 * textos/client/api-intake.json only. Nothing is written unless the whole chain verifies; an
 * existing file is never overwritten.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IntakeRefusedError,
  TextosApiError,
  collectRelease,
  createTextosApiClient,
  parseIntakeEvidence,
  receiveDelivery,
  requestRelease,
  type IntakeEvidence,
  type IntakeReport,
} from "../../packages/textos-intake/src/index";
import { apiIntakeExpectations, readApiIntakeConfig, shortsosAdapter } from "../../src/lib/textos/api-intake";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function fail(message: string): never {
  console.error(`textos:intake: ${message}`);
  process.exit(1);
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) fail(`--${name} needs a value.`);
  return value;
}

function id(args: string[], name: string, required: true): string;
function id(args: string[], name: string, required: false): string | undefined;
function id(args: string[], name: string, required: boolean): string | undefined {
  const value = option(args, name);
  if (value === undefined) {
    if (required) fail(`--${name} <id> is required.`);
    return undefined;
  }
  if (!ID.test(value)) fail(`--${name} ${JSON.stringify(value)} is not an id.`);
  return value;
}

function expectations() {
  const config = readApiIntakeConfig(REPO_ROOT);
  const expect = apiIntakeExpectations(REPO_ROOT);
  if (!expect) fail(`no TextOS workspace is assigned to ${config.siteId} yet (textos/client/api-intake.json → workspaceId).`);
  const fromEnv = process.env.TEXTOS_API_WORKSPACE_ID?.trim();
  if (fromEnv && fromEnv !== expect.workspaceId) fail(`TEXTOS_API_WORKSPACE_ID is ${fromEnv}, but this site is the destination of ${expect.workspaceId}.`);
  return expect;
}

function apiClient() {
  const baseUrl = process.env.TEXTOS_API_BASE_URL?.trim();
  const token = process.env.TEXTOS_API_TOKEN?.trim();
  if (!baseUrl || !token) fail("TEXTOS_API_BASE_URL and TEXTOS_API_TOKEN must be set (a service token of this site's workspace).");
  return createTextosApiClient({ baseUrl, token });
}

function print(report: IntakeReport): void {
  const release = report.verified?.delivery.contentDocument.identity;
  if (release) console.log(`release: ${release.title} (${release.slug}, ${report.verified!.delivery.locale})`);
  for (const failure of report.failures) console.log(`  refused — ${failure.code}: ${failure.message}`);
  for (const violation of report.violations) console.log(`  refused — ${violation}`);
  for (const file of report.files) console.log(`  ${file.action.padEnd(9)} ${file.path}`);
  console.log(`outcome: ${report.outcome}`);
  if (report.outcome === "refused") process.exit(1);
}

function receive(evidence: IntakeEvidence, dryRun: boolean): void {
  const expect = expectations();
  print(receiveDelivery({ evidence, expectations: expect, adapter: shortsosAdapter(REPO_ROOT, expect.siteId), root: REPO_ROOT, dryRun }));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (command === "request") {
    const expect = expectations();
    const contentDraftId = id(args, "content-draft", true);
    const requested = await requestRelease(apiClient(), { workspaceId: expect.workspaceId, siteId: expect.siteId, contentDraftId });
    console.log(JSON.stringify({ ...requested, next: "A person approves or rejects this exact decision in TextOS; once approved, run `receive --decision <decisionId>`." }, null, 2));
    return;
  }

  if (command === "receive") {
    const expect = expectations();
    const decisionId = id(args, "decision", true);
    const jobId = id(args, "job", false);
    const evidence = await collectRelease(apiClient(), {
      workspaceId: expect.workspaceId,
      siteId: expect.siteId,
      decisionId,
      ...(jobId ? { jobId } : {}),
      collectedAt: () => new Date().toISOString(),
    });
    receive(evidence, dryRun);
    return;
  }

  if (command === "replay") {
    const file = option(args, "evidence") ?? fail("--evidence <file> is required.");
    const parsed = parseIntakeEvidence(JSON.parse(readFileSync(resolve(file), "utf8")));
    if (!parsed.evidence) fail(`${file} is not textos-intake-evidence@1:\n  ${parsed.problems.join("\n  ")}`);
    receive(parsed.evidence, dryRun);
    return;
  }

  fail("first argument must be request, receive or replay.");
}

main().catch((error: unknown) => {
  if (error instanceof TextosApiError && error.notFound) {
    fail(`${error.message}. The API answers not_found for a resource this token does not own, and for a capability it does not serve — the release capability is still a proposal (packages/textos-intake/README.md).`);
  }
  if (error instanceof TextosApiError || error instanceof IntakeRefusedError) fail(error.message);
  throw error;
});
