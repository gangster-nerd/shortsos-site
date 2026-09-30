/**
 * The intake command a site runs, with nothing of its own but a configuration file and rules:
 *
 *   request --content-draft <id>             Ask TextOS for a person's decision on releasing
 *                                            that draft to this site.
 *   receive --decision <id> [--job <id>]     After approval: run the release under its grant,
 *           [--dry-run]                      verify it, write it. `--job` resumes a release
 *                                            already started.
 *   replay --evidence <file> [--dry-run]     The same from evidence already collected, offline.
 *   check                                    Re-verify every committed release (for the build).
 *
 * `request` and `receive` read TEXTOS_API_BASE_URL and TEXTOS_API_TOKEN from the environment;
 * the workspace comes from the committed configuration only (TEXTOS_API_WORKSPACE_ID, if set,
 * must match it). Returns an exit code instead of exiting, so that it can be tested.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TextosApiError, createTextosApiClient } from "./client";
import { IntakeRefusedError, collectRelease, requestRelease, type WaitOptions } from "./collect";
import { parseIntakeEvidence, type IntakeEvidence } from "./evidence";
import { receiveDelivery, type IntakeReport } from "./intake";
import { readSiteConfig, releaseAdapter, siteExpectations, verifyCommittedReleases, type SiteIntakeConfig, type SiteRules } from "./site-kit";

export interface IntakeCliOptions {
  /** The site's repository root. */
  root: string;
  /** Repository-relative path of its `textos-intake-config@1` file. */
  configPath: string;
  rules: SiteRules;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
  wait?: WaitOptions;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const USAGE = "usage: <request --content-draft <id> | receive --decision <id> [--job <id>] [--dry-run] | replay --evidence <file> [--dry-run] | check>";

class UsageError extends Error {}

function option(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new UsageError(`--${name} needs a value`);
  return value;
}

function id(args: readonly string[], name: string): string | undefined {
  const value = option(args, name);
  if (value !== undefined && !ID.test(value)) throw new UsageError(`--${name} ${JSON.stringify(value)} is not an id`);
  return value;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new UsageError(`${what} is required`);
  return value;
}

export async function runIntakeCli(argv: readonly string[], options: IntakeCliOptions): Promise<number> {
  const out = options.stdout ?? ((line: string) => console.log(line));
  const err = options.stderr ?? ((line: string) => console.error(line));
  const env = options.env ?? process.env;
  const [command, ...args] = argv;
  const dryRun = args.includes("--dry-run");

  const print = (report: IntakeReport): number => {
    const identity = report.verified?.delivery.contentDocument.identity;
    if (identity) out(`release: ${identity.title} (${identity.slug}, ${report.verified!.delivery.locale})`);
    for (const failure of report.failures) out(`  refused — ${failure.code}: ${failure.message}`);
    for (const violation of report.violations) out(`  refused — ${violation}`);
    for (const file of report.files) out(`  ${file.action.padEnd(9)} ${file.path}`);
    out(`outcome: ${report.outcome}`);
    return report.outcome === "refused" ? 1 : 0;
  };

  const accepting = (config: SiteIntakeConfig) => {
    const expectations = siteExpectations(config);
    if (!expectations) throw new IntakeRefusedError(`no TextOS workspace is assigned to ${config.siteId} yet (${options.configPath} → workspaceId)`);
    const fromEnv = env.TEXTOS_API_WORKSPACE_ID?.trim();
    if (fromEnv && fromEnv !== expectations.workspaceId) {
      throw new IntakeRefusedError(`TEXTOS_API_WORKSPACE_ID is ${fromEnv}, but this site is the destination of ${expectations.workspaceId}`);
    }
    return expectations;
  };

  const client = () => {
    const baseUrl = env.TEXTOS_API_BASE_URL?.trim();
    const token = env.TEXTOS_API_TOKEN?.trim();
    if (!baseUrl || !token) throw new IntakeRefusedError("TEXTOS_API_BASE_URL and TEXTOS_API_TOKEN must be set (a service token of this site's workspace)");
    return createTextosApiClient({ baseUrl, token, ...(options.fetch ? { fetch: options.fetch } : {}) });
  };

  const receive = (config: SiteIntakeConfig, evidence: IntakeEvidence): number =>
    print(receiveDelivery({ evidence, expectations: accepting(config), adapter: releaseAdapter(config, options.rules), root: options.root, dryRun }));

  if (!["request", "receive", "replay", "check"].includes(command ?? "")) {
    err(`textos-intake: unknown command ${JSON.stringify(command ?? "")}\n${USAGE}`);
    return 2;
  }
  let config: SiteIntakeConfig;
  try {
    config = readSiteConfig(options.root, options.configPath);
  } catch (error) {
    err(`textos-intake: cannot read ${options.configPath}: ${(error as Error).message}`);
    return 1;
  }

  try {
    if (command === "request") {
      const expectations = accepting(config);
      const contentDraftId = required(id(args, "content-draft"), "--content-draft <id>");
      const requested = await requestRelease(client(), { workspaceId: expectations.workspaceId, siteId: expectations.siteId, contentDraftId });
      out(JSON.stringify({ ...requested, next: "A person approves or rejects this exact decision in TextOS; once approved, run `receive --decision <decisionId>`." }, null, 2));
      return 0;
    }

    if (command === "receive") {
      const expectations = accepting(config);
      const decisionId = required(id(args, "decision"), "--decision <id>");
      const jobId = id(args, "job");
      const evidence = await collectRelease(client(), {
        workspaceId: expectations.workspaceId,
        siteId: expectations.siteId,
        decisionId,
        ...(jobId ? { jobId } : {}),
        collectedAt: () => (options.now ?? (() => new Date()))().toISOString(),
        ...(options.wait ? { wait: options.wait } : {}),
      });
      return receive(config, evidence);
    }

    if (command === "replay") {
      const file = required(option(args, "evidence"), "--evidence <file>");
      const parsed = parseIntakeEvidence(JSON.parse(readFileSync(resolve(options.root, file), "utf8")));
      if (!parsed.evidence) throw new IntakeRefusedError(`${file} is not textos-intake-evidence@1:\n  ${parsed.problems.join("\n  ")}`);
      return receive(config, parsed.evidence);
    }

    if (command === "check") {
      const { releases, problems } = verifyCommittedReleases(options.root, config, options.rules);
      for (const release of releases) out(`  verified  ${release.slug} (${release.locale}, approved ${release.approvedAt})`);
      for (const problem of problems) out(`  problem — ${problem}`);
      out(`check: ${releases.length} release(s) re-verified, ${problems.length} problem(s)`);
      return problems.length === 0 ? 0 : 1;
    }

    throw new UsageError(`unknown command ${JSON.stringify(command)}`);
  } catch (error) {
    if (error instanceof UsageError) {
      err(`textos-intake: ${error.message}\n${USAGE}`);
      return 2;
    }
    if (error instanceof TextosApiError && error.notFound) {
      err(
        `textos-intake: ${error.message}. The API answers not_found for a resource this token does not own, and for a capability it does not serve — the release capability is still a proposal (packages/textos-intake/README.md).`,
      );
      return 1;
    }
    if (error instanceof TextosApiError || error instanceof IntakeRefusedError) {
      err(`textos-intake: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
