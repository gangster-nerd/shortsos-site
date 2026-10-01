#!/usr/bin/env tsx
/**
 * Versions of the package (see README.md, "Versions").
 *
 *   tsx <package>/scripts/manifest.ts verify [--dir <copy>] [--expect <tree sha256>]
 *       Proves a copy is exactly a published version. A site that copied the package runs it in
 *       its CI with the tree digest it recorded.
 *   tsx <package>/scripts/manifest.ts write
 *       Maintainers: rewrites MANIFEST.json after a change. Refused when the files changed under
 *       a version already published — bump `version` in package.json first.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { MANIFEST_FILE, buildManifest, readManifest, serializeManifest, verifyPackageCopy } from "../src/manifest";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
const [command, ...args] = process.argv.slice(2);

function option(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

if (command === "verify") {
  const dir = resolve(option("dir") ?? PACKAGE_DIR);
  const expect = option("expect");
  const result = verifyPackageCopy(dir, expect !== undefined ? { expect } : {});
  if (!result.ok) {
    console.error(`source-intake copy at ${dir} is not a published version:\n  ${result.problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`source-intake ${result.version} — tree ${result.treeSha256} — OK`);
} else if (command === "write") {
  const { manifest, problems } = buildManifest(PACKAGE_DIR, readManifest(PACKAGE_DIR));
  if (!manifest) {
    console.error(`manifest: ${problems.join("; ")}`);
    process.exit(1);
  }
  writeFileSync(join(PACKAGE_DIR, MANIFEST_FILE), serializeManifest(manifest));
  console.log(`source-intake ${manifest.version} — tree ${manifest.treeSha256} — ${Object.keys(manifest.files).length} files`);
} else {
  console.error("usage: manifest.ts verify [--dir <copy>] [--expect <tree sha256>] | write");
  process.exit(2);
}
