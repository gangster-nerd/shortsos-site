#!/usr/bin/env tsx
/**
 * Recomputes the canonical-hash vectors (conformance/canonical-vectors.json) with the TextOS
 * API's OWN implementation, from a TextOS checkout at exactly the SHA the file names. The
 * checkout is only read: it must be clean before and after, and one file is imported from it.
 *
 *   tsx packages/textos-intake/scripts/canonical-vectors.ts --textos-path <textos-v0 checkout> [--write]
 *
 * Without --write it compares and fails on any difference — which would mean the package no
 * longer hashes like TextOS. With --write it fills in the expected values (for a new vector).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VECTORS_FILE = resolve(import.meta.dirname, "..", "conformance", "canonical-vectors.json");

interface Vector {
  name: string;
  value: unknown;
  canonical: string;
  sha256: string;
}

interface VectorsFile {
  vectorsVersion: string;
  computedWith: { repository: string; sha: string; file: string };
  vectors: Vector[];
  [key: string]: unknown;
}

function fail(message: string): never {
  console.error(`canonical-vectors: ${message}`);
  process.exit(1);
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function assertPristine(repo: string, when: string): void {
  const dirty = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty) fail(`the TextOS checkout is not clean ${when}; it must never be modified:\n${dirty}`);
}

const args = process.argv.slice(2);
const at = args.indexOf("--textos-path");
const textos = at >= 0 && args[at + 1] ? resolve(args[at + 1]!) : null;
if (!textos || !existsSync(join(textos, ".git"))) fail("--textos-path <path to a textos-v0 checkout> is required");
const write = args.includes("--write");

const file = JSON.parse(readFileSync(VECTORS_FILE, "utf8")) as VectorsFile;
const head = git(textos, ["rev-parse", "HEAD"]);
if (head !== file.computedWith.sha) {
  fail(`the checkout is at ${head}; the vectors are pinned to ${file.computedWith.sha}. Check that SHA out yourself — this script never changes the checkout.`);
}
assertPristine(textos, "before the run");

const textosCanonical = (await import(pathToFileURL(join(textos, file.computedWith.file)).href)) as {
  canonicalJson(value: unknown): string;
  hashCanonical(value: unknown): Promise<string>;
};
const recomputed: Vector[] = [];
const differing: string[] = [];
for (const vector of file.vectors) {
  const canonical = textosCanonical.canonicalJson(vector.value);
  const sha256 = await textosCanonical.hashCanonical(vector.value);
  if (canonical !== vector.canonical || sha256 !== vector.sha256) differing.push(vector.name);
  recomputed.push({ ...vector, canonical, sha256 });
}
assertPristine(textos, "after the run");

if (write) {
  writeFileSync(VECTORS_FILE, `${JSON.stringify({ ...file, vectors: recomputed }, null, 2)}\n`);
  console.log(`canonical-vectors: wrote ${recomputed.length} vectors from TextOS ${head} (${differing.length} changed)`);
} else if (differing.length > 0) {
  fail(`TextOS ${head} computes other values for: ${differing.join(", ")}`);
} else {
  console.log(`canonical-vectors: OK — ${recomputed.length} vectors match TextOS ${head}`);
}
