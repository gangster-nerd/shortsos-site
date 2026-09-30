/**
 * `textos-intake-manifest@1` — what a copy of this package must be, file by file. A site that
 * copies the package records the version and the tree digest it took; `verifyPackageCopy` then
 * proves its copy is exactly that version: no file changed, added or missing.
 *
 * The tree digest is the sha256 of one line per file, sorted by path —
 * `<sha256 of the file's bytes>  <path>\n`, the output format of `sha256sum` — so a shell can
 * recompute it without this code (README.md, "Versions"). MANIFEST.json itself is not covered.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SHA256_HEX } from "./canonical";

export const MANIFEST_FILE = "MANIFEST.json";
export const MANIFEST_VERSION = "textos-intake-manifest@1";

export interface PackageManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  name: string;
  version: string;
  treeSha256: string;
  files: Record<string, string>;
  /** Every version published, with its tree digest. */
  history: Record<string, string>;
}

function walk(dir: string, prefix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(join(dir, entry.name), rel);
    return rel === MANIFEST_FILE ? [] : [rel];
  });
}

/** Every file of a package copy but the manifest, as sorted POSIX paths. */
export function packageFiles(dir: string): string[] {
  return walk(dir, "").sort();
}

export function hashPackageFiles(dir: string): Record<string, string> {
  return Object.fromEntries(packageFiles(dir).map((path) => [path, createHash("sha256").update(readFileSync(join(dir, path))).digest("hex")]));
}

export function treeDigest(files: Record<string, string>): string {
  const lines = Object.keys(files)
    .sort()
    .map((path) => `${files[path]}  ${path}\n`)
    .join("");
  return createHash("sha256").update(lines, "utf8").digest("hex");
}

function packageVersion(dir: string): { name: string; version: string } {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name: string; version: string };
}

/**
 * The manifest of the package as it stands. Refused when the tree changed under a version
 * already published: a changed file needs a new version in package.json.
 */
export function buildManifest(dir: string, previous: PackageManifest | null): { manifest: PackageManifest | null; problems: string[] } {
  const { name, version } = packageVersion(dir);
  const files = hashPackageFiles(dir);
  const treeSha256 = treeDigest(files);
  const published = previous?.history[version];
  if (published && published !== treeSha256) {
    return { manifest: null, problems: [`version ${version} was published with tree ${published}; the files changed, so package.json needs a new version`] };
  }
  return {
    manifest: { manifestVersion: MANIFEST_VERSION, name, version, treeSha256, files, history: { ...previous?.history, [version]: treeSha256 } },
    problems: [],
  };
}

export function readManifest(dir: string): PackageManifest | null {
  const path = join(dir, MANIFEST_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PackageManifest) : null;
}

export function serializeManifest(manifest: PackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Proves a copy is exactly a published version: every file matches the manifest, none is extra
 * or missing, and — with `expect` — the tree is the one the site recorded when it took the copy.
 */
export function verifyPackageCopy(dir: string, options: { expect?: string } = {}): { ok: boolean; version: string | null; treeSha256: string; problems: string[] } {
  const manifest = readManifest(dir);
  const files = hashPackageFiles(dir);
  const treeSha256 = treeDigest(files);
  const problems: string[] = [];
  if (!manifest || manifest.manifestVersion !== MANIFEST_VERSION) {
    problems.push(`no ${MANIFEST_VERSION} ${MANIFEST_FILE}`);
    return { ok: false, version: null, treeSha256, problems };
  }
  for (const [path, sha256] of Object.entries(manifest.files)) {
    if (!(path in files)) problems.push(`${path} is missing`);
    else if (files[path] !== sha256) problems.push(`${path} differs from version ${manifest.version}`);
  }
  for (const path of Object.keys(files)) if (!(path in manifest.files)) problems.push(`${path} is not part of version ${manifest.version}`);
  if (treeDigest(manifest.files) !== manifest.treeSha256) problems.push(`${MANIFEST_FILE} does not add up: its files do not give its tree digest`);
  if (manifest.history[manifest.version] !== manifest.treeSha256) problems.push(`${MANIFEST_FILE} does not record version ${manifest.version} with this tree`);
  const declared = existsSync(join(dir, "package.json")) ? packageVersion(dir).version : null;
  if (declared !== manifest.version) problems.push(`package.json says ${declared ?? "nothing"}, ${MANIFEST_FILE} ${manifest.version}`);
  if (options.expect !== undefined) {
    if (!SHA256_HEX.test(options.expect)) problems.push(`--expect ${JSON.stringify(options.expect)} is not a sha256 digest`);
    else if (options.expect !== treeSha256) problems.push(`the copy's tree is ${treeSha256}, the site recorded ${options.expect}`);
  }
  return { ok: problems.length === 0, version: manifest.version, treeSha256, problems };
}
