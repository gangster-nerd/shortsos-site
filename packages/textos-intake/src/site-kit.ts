/**
 * Everything a Git-published site needs around the verification, so that adopting the package
 * means writing a configuration file and a few rules:
 *
 *   - `textos-intake-config@1`: what the site accepts, committed in its repository — never
 *     taken from the API;
 *   - the standard layout of a received release: `<releasesDir>/<slug>/evidence.json` (the API
 *     records it was verified from) and `intake.json` (the site's record of it), plus any file
 *     the site's rules add (an article record in the site's own format, for instance);
 *   - the build-time re-verification of every committed release.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

import { GIT_SHA, SHA256_HEX } from "./canonical";
import { parseIntakeEvidence, serializeEvidence } from "./evidence";
import { checkCommittedDelivery, repoPath, type PlannedFile, type SiteAdapter } from "./intake";
import type { ReleaseRule } from "./rules";
import { ShapeReader } from "./shape";
import type { IntakeExpectations, VerifiedDelivery } from "./verify";

export const SITE_CONFIG_VERSION = "textos-intake-config@1";
export const INTAKE_RECORD_VERSION = "textos-intake-record@1";
export const RELEASE_EVIDENCE_FILE = "evidence.json";
export const RELEASE_RECORD_FILE = "intake.json";

export interface SiteIntakeConfig {
  configVersion: typeof SITE_CONFIG_VERSION;
  /** The id TextOS addresses this site by. */
  siteId: string;
  /** The TextOS workspace this site is the destination of; null = nothing can be received. */
  workspaceId: string | null;
  /** BCP 47 tags of the languages the site publishes. */
  locales: string[];
  /** sha256 of the ContentDocument@1 JSON Schema the site renders against. */
  contentDocumentFingerprint: string;
  /** Engine SHAs accepted, or "any" to accept and record any. */
  acceptedEngineShas: string[] | "any";
  /** Repository-relative folder a release lands in, as `<releasesDir>/<slug>/`. */
  releasesDir: string;
}

/** Structural check of a site configuration. Keys it does not know (a `why` note) are ignored. */
export function parseSiteConfig(raw: unknown): { config: SiteIntakeConfig | null; problems: string[] } {
  const r = new ShapeReader();
  const root = r.object(raw, "config");
  r.literal(root, "configVersion", [SITE_CONFIG_VERSION] as const, "config");
  r.match(root, "siteId", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "a lowercase kebab-case id", "config");
  if (root.workspaceId !== null) r.string(root, "workspaceId", "config");
  r.stringArray(root, "locales", "config");
  r.match(root, "contentDocumentFingerprint", SHA256_HEX, "a sha256 hex digest", "config");
  if (root.acceptedEngineShas !== "any") {
    for (const sha of r.stringArray(root, "acceptedEngineShas", "config")) {
      if (!GIT_SHA.test(sha)) r.problems.push(`config.acceptedEngineShas: ${JSON.stringify(sha)} is not a commit SHA`);
    }
  }
  const dir = r.string(root, "releasesDir", "config");
  if (dir && (dir.startsWith("/") || dir.includes("\\") || posix.normalize(dir) !== dir || dir.split("/").includes(".."))) {
    r.problems.push("config.releasesDir: must be a plain repository-relative folder");
  }
  return r.problems.length === 0 ? { config: root as unknown as SiteIntakeConfig, problems: [] } : { config: null, problems: r.problems };
}

export function readSiteConfig(root: string, configPath: string): SiteIntakeConfig {
  const parsed = parseSiteConfig(JSON.parse(readFileSync(join(root, configPath), "utf8")));
  if (!parsed.config) throw new Error(`${configPath} is not ${SITE_CONFIG_VERSION}:\n  ${parsed.problems.join("\n  ")}`);
  return parsed.config;
}

/** What the site accepts, or null while no workspace is assigned. */
export function siteExpectations(config: SiteIntakeConfig): IntakeExpectations | null {
  if (!config.workspaceId) return null;
  return {
    siteId: config.siteId,
    workspaceId: config.workspaceId,
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

export function releaseFolder(config: SiteIntakeConfig, slug: string): string {
  return repoPath(config.releasesDir, slug);
}

/** The site's record of one received release (`intake.json`). */
export function intakeRecord(verified: VerifiedDelivery, siteId: string) {
  const { delivery, evidence } = verified;
  const document = delivery.contentDocument;
  return {
    recordVersion: INTAKE_RECORD_VERSION,
    siteId,
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
export function releaseAdapter(config: SiteIntakeConfig, rules: SiteRules): SiteAdapter {
  return {
    siteId: config.siteId,
    review: (verified) => rules.review(verified),
    plan: (verified) => {
      const folder = releaseFolder(config, verified.delivery.contentDocument.identity.slug);
      return [
        { path: repoPath(folder, RELEASE_EVIDENCE_FILE), content: serializeEvidence(verified.evidence) },
        { path: repoPath(folder, RELEASE_RECORD_FILE), content: `${JSON.stringify(intakeRecord(verified, config.siteId), null, 2)}\n` },
        ...(rules.extraFiles?.(verified) ?? []),
      ];
    },
  };
}

export interface ReceivedRelease {
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
export function verifyCommittedReleases(root: string, config: SiteIntakeConfig, rules: SiteRules): { releases: ReceivedRelease[]; problems: string[] } {
  const base = join(root, config.releasesDir);
  if (!existsSync(base)) return { releases: [], problems: [] };
  const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.name !== "README.md");
  if (entries.length === 0) return { releases: [], problems: [] };

  const expectations = siteExpectations(config);
  if (!expectations) return { releases: [], problems: [`${config.releasesDir} holds releases but no TextOS workspace is assigned`] };
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
