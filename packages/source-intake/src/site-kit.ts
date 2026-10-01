/**
 * Everything a Git-published site needs around the verification, so that adopting the package
 * means writing one configuration file per source and a few rules:
 *
 *   - `source-intake-config@1`: what the site accepts from one source, committed in its
 *     repository as `<sourcesDir>/<source>.json` — never taken from the API;
 *   - the environment variables of that source's API, named after its id;
 *   - the standard layout of a received release: `<releasesDir>/<slug>/evidence.json` (the API
 *     records it was verified from) and `intake.json` (the site's record of it), plus any file
 *     the site's rules add (an article record in the site's own format, for instance);
 *   - the build-time re-verification of every committed release.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

import { GIT_SHA, SHA256_HEX } from "./canonical";
import type { ReleaseContract } from "./delivery";
import { parseIntakeEvidence, serializeEvidence } from "./evidence";
import { checkCommittedDelivery, repoPath, type PlannedFile, type SiteAdapter } from "./intake";
import type { ReleaseRule } from "./rules";
import { ShapeReader } from "./shape";
import type { IntakeExpectations, VerifiedDelivery } from "./verify";

export const SOURCE_CONFIG_VERSION = "source-intake-config@1";
export const INTAKE_RECORD_VERSION = "source-intake-record@1";
export const RELEASE_EVIDENCE_FILE = "evidence.json";
export const RELEASE_RECORD_FILE = "intake.json";

/**
 * A source id: lowercase letters and digits, starting with a letter. It names the configuration
 * file and, in upper case, the environment variables (and CI secrets) of the source's API.
 */
export const SOURCE_ID = /^[a-z][a-z0-9]*$/;
const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SourceIntakeConfig {
  configVersion: typeof SOURCE_CONFIG_VERSION;
  /** The source's id; the configuration is `<sourcesDir>/<source>.json`. */
  source: string;
  /** The id the source addresses this site by. */
  siteId: string;
  /** The source's workspace this site is the destination of; null = nothing can be received. */
  workspaceId: string | null;
  /** How the source names a release to this site. */
  release: ReleaseContract;
  /** BCP 47 tags of the languages the site publishes. */
  locales: string[];
  /** sha256 of the ContentDocument@1 JSON Schema the site renders against. */
  contentDocumentFingerprint: string;
  /** Engine SHAs accepted, or "any" to accept and record any. */
  acceptedEngineShas: string[] | "any";
  /** Repository-relative folder a release lands in, as `<releasesDir>/<slug>/`. */
  releasesDir: string;
}

function plainFolder(dir: string): boolean {
  return !dir.startsWith("/") && !dir.includes("\\") && posix.normalize(dir) === dir && !dir.split("/").includes("..");
}

/** Structural check of a source configuration. Keys it does not know (a `why` note) are ignored. */
export function parseSourceConfig(raw: unknown): { config: SourceIntakeConfig | null; problems: string[] } {
  const r = new ShapeReader();
  const root = r.object(raw, "config");
  r.literal(root, "configVersion", [SOURCE_CONFIG_VERSION] as const, "config");
  r.match(root, "source", SOURCE_ID, "lowercase letters and digits, starting with a letter", "config");
  r.match(root, "siteId", KEBAB_ID, "a lowercase kebab-case id", "config");
  if (root.workspaceId !== null) r.string(root, "workspaceId", "config");
  const release = r.object(root.release, "config.release");
  for (const key of ["capability", "deliveryContract", "targetKind"]) r.string(release, key, "config.release");
  r.stringArray(root, "locales", "config");
  r.match(root, "contentDocumentFingerprint", SHA256_HEX, "a sha256 hex digest", "config");
  if (root.acceptedEngineShas !== "any") {
    for (const sha of r.stringArray(root, "acceptedEngineShas", "config")) {
      if (!GIT_SHA.test(sha)) r.problems.push(`config.acceptedEngineShas: ${JSON.stringify(sha)} is not a commit SHA`);
    }
  }
  const dir = r.string(root, "releasesDir", "config");
  if (dir && !plainFolder(dir)) r.problems.push("config.releasesDir: must be a plain repository-relative folder");
  return r.problems.length === 0 ? { config: root as unknown as SourceIntakeConfig, problems: [] } : { config: null, problems: r.problems };
}

/** Where a source's configuration lives: `<sourcesDir>/<source>.json`. */
export function sourceConfigPath(sourcesDir: string, source: string): string {
  if (!SOURCE_ID.test(source)) throw new Error(`${JSON.stringify(source)} is not a source id (lowercase letters and digits, starting with a letter)`);
  return repoPath(sourcesDir, `${source}.json`);
}

/** Reads and checks one source's configuration; its `source` must match its file name. */
export function readSourceConfig(root: string, sourcesDir: string, source: string): SourceIntakeConfig {
  const path = sourceConfigPath(sourcesDir, source);
  if (!existsSync(join(root, path))) throw new Error(`${path} does not exist: ${source} is not a configured source`);
  const parsed = parseSourceConfig(JSON.parse(readFileSync(join(root, path), "utf8")));
  if (!parsed.config) throw new Error(`${path} is not ${SOURCE_CONFIG_VERSION}:\n  ${parsed.problems.join("\n  ")}`);
  if (parsed.config.source !== source) throw new Error(`${path} configures source ${parsed.config.source}, not ${source}`);
  return parsed.config;
}

/** The ids of the configured sources: every `<id>.json` in `sourcesDir`, sorted. */
export function listSources(root: string, sourcesDir: string): string[] {
  const dir = join(root, sourcesDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

/** Every configured source. Two sources never share, or nest, their releases folders. */
export function readSourceConfigs(root: string, sourcesDir: string): SourceIntakeConfig[] {
  const configs = listSources(root, sourcesDir).map((source) => readSourceConfig(root, sourcesDir, source));
  for (const a of configs) {
    for (const b of configs) {
      if (a !== b && (a.releasesDir === b.releasesDir || a.releasesDir.startsWith(`${b.releasesDir}/`))) {
        throw new Error(`sources ${a.source} and ${b.source} share releases folders (${a.releasesDir}, ${b.releasesDir})`);
      }
    }
  }
  return configs;
}

/**
 * The environment variables of a source's API, named after its id in upper case:
 * `<ID>_API_BASE_URL`, `<ID>_API_TOKEN`, and `<ID>_API_WORKSPACE_ID` (optional; when set, it
 * must be the workspace the configuration names).
 */
export function sourceEnvNames(source: string): { baseUrl: string; token: string; workspaceId: string } {
  const prefix = source.toUpperCase();
  return { baseUrl: `${prefix}_API_BASE_URL`, token: `${prefix}_API_TOKEN`, workspaceId: `${prefix}_API_WORKSPACE_ID` };
}

/** What the site accepts from the source, or null while no workspace is assigned. */
export function siteExpectations(config: SourceIntakeConfig): IntakeExpectations | null {
  if (!config.workspaceId) return null;
  return {
    siteId: config.siteId,
    workspaceId: config.workspaceId,
    release: config.release,
    locales: config.locales,
    contentDocumentFingerprint: config.contentDocumentFingerprint,
    acceptedEngineShas: config.acceptedEngineShas,
  };
}

/** The site-specific part of an intake: its refusals, and any file it adds to a release. */
export interface SiteRules {
  review: ReleaseRule;
  /** Files besides the evidence and the record; must depend on the verified release alone. */
  extraFiles?(verified: VerifiedDelivery): PlannedFile[];
}

export function releaseFolder(config: SourceIntakeConfig, slug: string): string {
  return repoPath(config.releasesDir, slug);
}

/** The site's record of one received release (`intake.json`). */
export function intakeRecord(verified: VerifiedDelivery, config: Pick<SourceIntakeConfig, "source" | "siteId">) {
  const { delivery, evidence } = verified;
  const document = delivery.contentDocument;
  return {
    recordVersion: INTAKE_RECORD_VERSION,
    source: config.source,
    siteId: config.siteId,
    slug: document.identity.slug,
    receivedOn: evidence.collectedAt.slice(0, 10),
    release: {
      contract: evidence.artifact.contract,
      artifactId: verified.artifactId,
      artifactSha256: verified.artifactSha256,
      contentDraftId: delivery.source.contentDraftId,
      locale: delivery.locale,
      title: document.identity.title,
    },
    approval: {
      decisionId: verified.decisionId,
      actionEnvelopeHash: verified.actionEnvelopeHash,
      approvedAt: verified.approvedAt,
    },
    engineSha: verified.engineSha,
  };
}

/** The standard adapter: evidence + record in the release folder, plus the rules' extra files. */
export function releaseAdapter(config: SourceIntakeConfig, rules: SiteRules): SiteAdapter {
  return {
    siteId: config.siteId,
    review: (verified) => rules.review(verified),
    plan: (verified) => {
      const folder = releaseFolder(config, verified.delivery.contentDocument.identity.slug);
      return [
        { path: repoPath(folder, RELEASE_EVIDENCE_FILE), content: serializeEvidence(verified.evidence) },
        { path: repoPath(folder, RELEASE_RECORD_FILE), content: `${JSON.stringify(intakeRecord(verified, config), null, 2)}\n` },
        ...(rules.extraFiles?.(verified) ?? []),
      ];
    },
  };
}

export interface ReceivedRelease {
  source: string;
  slug: string;
  title: string;
  locale: string;
  approvedAt: string;
  engineSha: string;
  artifactSha256: string;
}

/**
 * Re-verifies every release committed under `releasesDir`: the chain from the stored evidence,
 * the site's rules, every planned file byte for byte, and nothing else in a release folder.
 */
export function verifyCommittedReleases(root: string, config: SourceIntakeConfig, rules: SiteRules): { releases: ReceivedRelease[]; problems: string[] } {
  const base = join(root, config.releasesDir);
  if (!existsSync(base)) return { releases: [], problems: [] };
  const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.name !== "README.md");
  if (entries.length === 0) return { releases: [], problems: [] };

  const expectations = siteExpectations(config);
  if (!expectations) return { releases: [], problems: [`${config.releasesDir} holds releases but no workspace of source ${config.source} is assigned`] };
  const adapter = releaseAdapter(config, rules);

  const releases: ReceivedRelease[] = [];
  const problems: string[] = [];
  for (const entry of entries) {
    const at = repoPath(config.releasesDir, entry.name);
    if (!entry.isDirectory()) {
      problems.push(`${at} is not a release folder`);
      continue;
    }
    const evidencePath = join(base, entry.name, RELEASE_EVIDENCE_FILE);
    if (!existsSync(evidencePath)) {
      problems.push(`${at}/${RELEASE_EVIDENCE_FILE} is missing`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(evidencePath, "utf8"));
    } catch (err) {
      problems.push(`${at}/${RELEASE_EVIDENCE_FILE} is not JSON: ${(err as Error).message}`);
      continue;
    }
    const parsed = parseIntakeEvidence(raw);
    if (!parsed.evidence) {
      problems.push(...parsed.problems.map((p) => `${at}: ${p}`));
      continue;
    }
    const checked = checkCommittedDelivery({ evidence: parsed.evidence, expectations, adapter, root });
    problems.push(...checked.problems.map((p) => `${at}: ${p}`));
    if (!checked.verified) continue;

    const document = checked.verified.delivery.contentDocument;
    if (document.identity.slug !== entry.name) problems.push(`${at} holds the release of ${document.identity.slug}`);
    const planned = new Set(adapter.plan(checked.verified).map((f) => f.path));
    const stray = readdirSync(join(base, entry.name)).filter((name) => !planned.has(repoPath(at, name)));
    if (stray.length > 0) problems.push(`${at} holds files the intake never writes: ${stray.join(", ")}`);

    releases.push({
      source: config.source,
      slug: document.identity.slug,
      title: document.identity.title,
      locale: checked.verified.delivery.locale,
      approvedAt: checked.verified.approvedAt,
      engineSha: checked.verified.engineSha,
      artifactSha256: checked.verified.artifactSha256,
    });
  }
  return { releases, problems };
}
