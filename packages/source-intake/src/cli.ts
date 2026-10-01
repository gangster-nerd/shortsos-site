/**
 * The intake command a site runs, with nothing of its own but a configuration file per source and
 * its rules:
 *
 *   request --source <id> --content-draft <id>
 *       Ask the source for a person's decision on releasing that draft to this site.
 *   receive --source <id> --decision <id> [--job <id>] [--dry-run]
 *       After approval: run the release under its grant, verify it, write it. `--job` resumes a
 *       release already started.
 *   replay --source <id> --evidence <file> [--dry-run]
 *       The same from evidence already collected, offline.
 *   check [--source <id>]
 *       Re-verify every committed release, of one source or of all (for the build).
 *
 * Source <id> is configured in `<sourcesDir>/<id>.json`. `request` and `receive` read its API's
 * address and token from `<ID>_API_BASE_URL` and `<ID>_API_TOKEN` (`sourceEnvNames`); the
 * workspace comes from the committed configuration only (`<ID>_API_WORKSPACE_ID`, if set, must
 * match it). Returns an exit code instead of exiting, so that it can be tested.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SourceApiError, createSourceApiClient } from "./client";
import { IntakeRefusedError, collectRelease, requestRelease, type WaitOptions } from "./collect";
import { EVIDENCE_VERSION, parseIntakeEvidence, type IntakeEvidence } from "./evidence";
import { receiveDelivery, type IntakeReport } from "./intake";
import {
  readSourceConfig,
  readSourceConfigs,
  releaseAdapter,
  siteExpectations,
  sourceConfigPath,
  sourceEnvNames,
  verifyCommittedReleases,
  type SiteRules,
  type SourceIntakeConfig,
} from "./site-kit";

export interface IntakeCliOptions {
  /** The site's repository root. */
  root: string;
  /** Repository-relative folder of the `source-intake-config@1` files, one per source. */
  sourcesDir: string;
  /** The site's rules for a release from one source. */
  rules: (config: SourceIntakeConfig) => SiteRules;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
  wait?: WaitOptions;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const USAGE =
  "usage: <request --source <id> --content-draft <id> | receive --source <id> --decision <id> [--job <id>] [--dry-run] | " +
  "replay --source <id> --evidence <file> [--dry-run] | check [--source <id>]>";

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

  const accepting = (config: SourceIntakeConfig) => {
    const expectations = siteExpectations(config);
    if (!expectations) {
      throw new IntakeRefusedError(
        `no workspace of source ${config.source} is assigned to ${config.siteId} yet (${sourceConfigPath(options.sourcesDir, config.source)} → workspaceId)`,
      );
    }
    const names = sourceEnvNames(config.source);
    const fromEnv = env[names.workspaceId]?.trim();
    if (fromEnv && fromEnv !== expectations.workspaceId) {
      throw new IntakeRefusedError(`${names.workspaceId} is ${fromEnv}, but this site is the destination of ${expectations.workspaceId}`);
    }
    return expectations;
  };

  const client = (config: SourceIntakeConfig) => {
    const names = sourceEnvNames(config.source);
    const baseUrl = env[names.baseUrl]?.trim();
    const token = env[names.token]?.trim();
    if (!baseUrl || !token) {
      throw new IntakeRefusedError(`${names.baseUrl} and ${names.token} must be set (a service token of this site's workspace at ${config.source})`);
    }
    return createSourceApiClient({ baseUrl, token, source: config.source, ...(options.fetch ? { fetch: options.fetch } : {}) });
  };

  const receive = (config: SourceIntakeConfig, evidence: IntakeEvidence): number =>
    print(receiveDelivery({ evidence, expectations: accepting(config), adapter: releaseAdapter(config, options.rules(config)), root: options.root, dryRun }));

  if (!["request", "receive", "replay", "check"].includes(command ?? "")) {
    err(`source-intake: unknown command ${JSON.stringify(command ?? "")}\n${USAGE}`);
    return 2;
  }

  let source: string | undefined;
  try {
    source = option(args, "source");
    if (source === undefined && command !== "check") throw new UsageError("--source <id> is required");
  } catch (error) {
    err(`source-intake: ${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  let configs: SourceIntakeConfig[];
  try {
    configs = source === undefined ? readSourceConfigs(options.root, options.sourcesDir) : [readSourceConfig(options.root, options.sourcesDir, source)];
  } catch (error) {
    err(`source-intake: ${(error as Error).message}`);
    return 1;
  }

  if (command === "check") {
    let count = 0;
    const problems: string[] = [];
    for (const config of configs) {
      const checked = verifyCommittedReleases(options.root, config, options.rules(config));
      for (const release of checked.releases) out(`  verified  ${config.source}/${release.slug} (${release.locale}, approved ${release.approvedAt})`);
      for (const problem of checked.problems) out(`  problem — ${problem}`);
      count += checked.releases.length;
      problems.push(...checked.problems);
    }
    out(`check: ${count} release(s) re-verified, ${problems.length} problem(s)`);
    return problems.length === 0 ? 0 : 1;
  }

  // request, receive and replay name exactly one source.
  const config = configs[0]!;
  try {
    if (command === "request") {
      const expectations = accepting(config);
      const contentDraftId = required(id(args, "content-draft"), "--content-draft <id>");
      const requested = await requestRelease(client(config), {
        workspaceId: expectations.workspaceId,
        siteId: expectations.siteId,
        release: expectations.release,
        contentDraftId,
      });
      const next = `A person approves or rejects this exact decision at ${config.source}; once approved, run \`receive --source ${config.source} --decision <decisionId>\`.`;
      out(JSON.stringify({ ...requested, next }, null, 2));
      return 0;
    }

    if (command === "receive") {
      const expectations = accepting(config);
      const decisionId = required(id(args, "decision"), "--decision <id>");
      const jobId = id(args, "job");
      const evidence = await collectRelease(client(config), {
        workspaceId: expectations.workspaceId,
        siteId: expectations.siteId,
        release: expectations.release,
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
      if (!parsed.evidence) throw new IntakeRefusedError(`${file} is not ${EVIDENCE_VERSION}:\n  ${parsed.problems.join("\n  ")}`);
      return receive(config, parsed.evidence);
    }

    throw new UsageError(`unknown command ${JSON.stringify(command)}`);
  } catch (error) {
    if (error instanceof UsageError) {
      err(`source-intake: ${error.message}\n${USAGE}`);
      return 2;
    }
    if (error instanceof SourceApiError && error.notFound) {
      err(
        `source-intake: ${error.message}. The API answers not_found for a resource this token does not own, and for a capability it does not serve: does ${config.source} serve ${config.release.capability}?`,
      );
      return 1;
    }
    if (error instanceof SourceApiError || error instanceof IntakeRefusedError) {
      err(`source-intake: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
