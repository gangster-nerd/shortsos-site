/**
 * ShortsOS's side of the TextOS API intake (`packages/textos-intake`): what this site accepts
 * (`textos/client/api-intake.json`), the rules a release must also meet here, and where a
 * release is kept.
 *
 * A release lands in `textos/api/<slug>/` as exactly two files:
 *   - `evidence.json` — the API records it was verified from, principal ids redacted;
 *   - `intake.json`   — ShortsOS's record of what was received and who approved it.
 * Both are a pure function of the verified release, so `content:verify` re-derives them from
 * the stored evidence and fails on any difference: nobody edits a received release by hand.
 *
 * Received releases are verified and kept; no page renders them yet.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  checkCommittedDelivery,
  parseIntakeEvidence,
  readableText,
  repoPath,
  serializeEvidence,
  type ContentBlockKind,
  type IntakeExpectations,
  type PlannedFile,
  type SiteAdapter,
  type VerifiedDelivery,
} from "../../../packages/textos-intake/src/index";
import { findForbiddenSelfServePhrases } from "../safety/copy-safety";
import { readBriefs } from "./articles";

export const API_RELEASES_DIR = "textos/api";
const RELEASE_FILES = ["evidence.json", "intake.json"] as const;

/** The ContentDocument@1 blocks a ShortsOS insights page can show: TextOS's article vocabulary. */
export const RENDERABLE_BLOCK_KINDS: readonly ContentBlockKind[] = ["answer", "heading", "paragraph", "steps", "source"];

export interface ApiIntakeConfig {
  apiIntakeVersion: 1;
  siteId: string;
  workspaceId: string | null;
  locales: string[];
  acceptedEngineShas: string[] | "any";
}

export function readApiIntakeConfig(root: string): ApiIntakeConfig {
  return JSON.parse(readFileSync(join(root, "textos", "client", "api-intake.json"), "utf8")) as ApiIntakeConfig;
}

/** What this site accepts, from its committed configuration; null until a workspace is assigned. */
export function apiIntakeExpectations(root: string): IntakeExpectations | null {
  const config = readApiIntakeConfig(root);
  if (!config.workspaceId) return null;
  const tool = JSON.parse(readFileSync(join(root, "textos", "tool.json"), "utf8")) as { contentDocumentContract: { fingerprint: string } };
  return {
    siteId: config.siteId,
    workspaceId: config.workspaceId,
    locales: config.locales,
    contentDocumentFingerprint: tool.contentDocumentContract.fingerprint,
    acceptedEngineShas: config.acceptedEngineShas,
  };
}

/** ShortsOS's own record of one received release (`textos/api/<slug>/intake.json`). */
export function intakeRecord(verified: VerifiedDelivery, siteId: string) {
  const { delivery, evidence } = verified;
  const document = delivery.contentDocument;
  return {
    intakeRecordVersion: 1,
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

export function shortsosAdapter(root: string, siteId: string): SiteAdapter {
  return {
    siteId,
    review(verified) {
      const document = verified.delivery.contentDocument;
      const slug = document.identity.slug;
      const violations: string[] = [];

      if (readBriefs(root).some((brief) => brief.slug === slug)) violations.push(`slug ${slug} is already an insights article of this site`);

      for (const block of document.body) {
        if (!RENDERABLE_BLOCK_KINDS.includes(block.kind)) violations.push(`block ${block.id} is a ${block.kind}, which an insights page does not show`);
      }
      if ((document.conversion as { conversionAllowed?: unknown } | undefined)?.conversionAllowed === true) {
        violations.push("the document allows conversion; insights pages carry no commercial slot");
      }

      const text = readableText(document);
      for (const hit of findForbiddenSelfServePhrases(text.join("\n"))) {
        violations.push(`says "${hit.phrase}" — ShortsOS is not self-serve (M1)`);
      }
      if (text.some((t) => /\btextos\b/i.test(t))) violations.push("names the tool it was written with; pages never do");
      return violations;
    },
    plan(verified): PlannedFile[] {
      const dir = repoPath(API_RELEASES_DIR, verified.delivery.contentDocument.identity.slug);
      return [
        { path: repoPath(dir, "evidence.json"), content: serializeEvidence(verified.evidence) },
        { path: repoPath(dir, "intake.json"), content: `${JSON.stringify(intakeRecord(verified, siteId), null, 2)}\n` },
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
}

/**
 * Re-verifies every release committed under `textos/api/` (what `content:verify` runs):
 * the chain from the stored evidence, this site's rules, exact files, nothing else in the folder.
 */
export function verifyCommittedReleases(root: string): { releases: ReceivedRelease[]; problems: string[] } {
  const base = join(root, API_RELEASES_DIR);
  if (!existsSync(base)) return { releases: [], problems: [] };
  const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.name !== "README.md");
  if (entries.length === 0) return { releases: [], problems: [] };

  const expectations = apiIntakeExpectations(root);
  if (!expectations) return { releases: [], problems: [`${API_RELEASES_DIR} holds releases but no TextOS workspace is assigned in textos/client/api-intake.json`] };
  const adapter = shortsosAdapter(root, expectations.siteId);

  const releases: ReceivedRelease[] = [];
  const problems: string[] = [];
  for (const entry of entries) {
    const at = `${API_RELEASES_DIR}/${entry.name}`;
    if (!entry.isDirectory()) {
      problems.push(`${at} is not a release folder`);
      continue;
    }
    const extra = readdirSync(join(base, entry.name)).filter((f) => !(RELEASE_FILES as readonly string[]).includes(f));
    if (extra.length > 0) problems.push(`${at} holds files the intake never writes: ${extra.join(", ")}`);
    const evidencePath = join(base, entry.name, "evidence.json");
    if (!existsSync(evidencePath)) {
      problems.push(`${at}/evidence.json is missing`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(evidencePath, "utf8"));
    } catch (err) {
      problems.push(`${at}/evidence.json is not JSON: ${(err as Error).message}`);
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
    releases.push({
      slug: document.identity.slug,
      title: document.identity.title,
      locale: checked.verified.delivery.locale,
      approvedAt: checked.verified.approvedAt,
      engineSha: checked.verified.engineSha,
    });
  }
  return { releases, problems };
}
