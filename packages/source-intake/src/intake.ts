/**
 * From verified evidence to files in a site, through the site's adapter.
 *
 * The package knows nothing about any site. A site plugs in with a `SiteAdapter`: its own rules
 * on a verified delivery (`review`) and the files a delivery becomes in its repository (`plan`).
 * The plan must be a pure function of the verified delivery, so that a build can re-derive it
 * from the stored evidence and compare it byte for byte with what is committed
 * (`checkCommittedDelivery`): a received delivery is never edited by hand.
 *
 * Writing is all-or-nothing and never overwrites: a planned file that already exists with other
 * content refuses the whole intake.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";

import type { IntakeEvidence } from "./evidence";
import { verifyEvidence, type IntakeExpectations, type IntakeFailure, type VerifiedDelivery } from "./verify";

export interface PlannedFile {
  /** Repository-relative POSIX path. */
  path: string;
  content: string;
}

export interface SiteAdapter {
  readonly siteId: string;
  /** The site's own rules on a delivery whose chain already verified. Any violation refuses it. */
  review(verified: VerifiedDelivery): string[];
  /** The files the delivery becomes in the site. Must depend on `verified` alone. */
  plan(verified: VerifiedDelivery): PlannedFile[];
}

export type FileAction = "create" | "unchanged" | "conflict";

export interface IntakeReport {
  outcome: "written" | "unchanged" | "planned" | "refused";
  failures: IntakeFailure[];
  violations: string[];
  files: { path: string; action: FileAction }[];
  verified: VerifiedDelivery | null;
}

function resolveInside(root: string, path: string): string {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`planned path ${JSON.stringify(path)} is not a plain repository-relative path`);
  }
  const full = resolve(root, path);
  const rel = relative(resolve(root), full);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`planned path ${path} leaves the repository`);
  return full;
}

function actionFor(root: string, file: PlannedFile): FileAction {
  const full = resolveInside(root, file.path);
  if (!existsSync(full)) return "create";
  return readFileSync(full, "utf8") === file.content ? "unchanged" : "conflict";
}

export function receiveDelivery(input: {
  evidence: IntakeEvidence;
  expectations: IntakeExpectations;
  adapter: SiteAdapter;
  root: string;
  dryRun?: boolean;
}): IntakeReport {
  const refused = (partial: Partial<IntakeReport>): IntakeReport => ({ outcome: "refused", failures: [], violations: [], files: [], verified: null, ...partial });
  if (input.adapter.siteId !== input.expectations.siteId) {
    return refused({ violations: [`adapter is for ${input.adapter.siteId}, expectations for ${input.expectations.siteId}`] });
  }

  const result = verifyEvidence(input.evidence, input.expectations);
  if (!result.ok) return refused({ failures: result.failures });
  const verified = result.verified;

  const violations = input.adapter.review(verified);
  if (violations.length > 0) return refused({ violations, verified });

  const planned = input.adapter.plan(verified);
  const files = planned.map((file) => ({ path: file.path, action: actionFor(input.root, file) }));
  const conflicts = files.filter((f) => f.action === "conflict");
  if (conflicts.length > 0) {
    return refused({
      files,
      verified,
      violations: conflicts.map((f) => `${f.path} already exists with other content — a received delivery is never overwritten`),
    });
  }

  if (input.dryRun) return { outcome: "planned", failures: [], violations: [], files, verified };
  for (const file of planned) {
    const full = resolveInside(input.root, file.path);
    if (existsSync(full)) continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.content, { encoding: "utf8", flag: "wx" });
  }
  const outcome = files.some((f) => f.action === "create") ? "written" : "unchanged";
  return { outcome, failures: [], violations: [], files, verified };
}

/**
 * Build-time re-verification of a committed delivery: the chain still verifies from the stored
 * evidence, the site's rules still hold, and every planned file is committed exactly.
 * Returns the problems found (empty = the committed delivery is exactly what intake produced).
 */
export function checkCommittedDelivery(input: {
  evidence: IntakeEvidence;
  expectations: IntakeExpectations;
  adapter: SiteAdapter;
  root: string;
}): { problems: string[]; verified: VerifiedDelivery | null } {
  const result = verifyEvidence(input.evidence, input.expectations);
  if (!result.ok) return { problems: result.failures.map((f) => `${f.code}: ${f.message}`), verified: null };
  const problems = [...input.adapter.review(result.verified)];
  for (const file of input.adapter.plan(result.verified)) {
    const action = actionFor(input.root, file);
    if (action === "create") problems.push(`${file.path} is missing`);
    if (action === "conflict") problems.push(`${file.path} differs from what the intake writes for this delivery`);
  }
  return { problems, verified: result.verified };
}

/** Joins a planned repository path (always POSIX separators, whatever the OS). */
export function repoPath(...parts: string[]): string {
  return posix.join(...parts);
}
