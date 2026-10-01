import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildManifest, hashPackageFiles, readManifest, treeDigest, verifyPackageCopy } from "../src/manifest";

/**
 * MANIFEST.json must describe exactly the files of this version. After a change, run
 * `tsx scripts/manifest.ts write` — and bump `version` in package.json first if the current
 * version was already published: `write` refuses to change a published version's tree.
 */
const PACKAGE_DIR = resolve(import.meta.dirname, "..");
/** Tree digest of 0.1.0, as pushed in commit 8716d07 (before the manifest existed). */
const V0_1_0 = "c0d179e2613a9fded8417e8fb6bfb503fa5ccfe53f3387aa06c151325bd3ea13";

describe("package versions", () => {
  const manifest = readManifest(PACKAGE_DIR)!;

  it("MANIFEST.json describes exactly the files of this version", () => {
    expect(verifyPackageCopy(PACKAGE_DIR).problems).toEqual([]);
  });

  it("records every published version, 0.1.0 included", () => {
    expect(manifest.history["0.1.0"]).toBe(V0_1_0);
    expect(manifest.history[manifest.version]).toBe(manifest.treeSha256);
  });

  it("refuses to change a published version's tree", () => {
    const published = { ...manifest, history: { ...manifest.history, [manifest.version]: "0".repeat(64) } };
    expect(buildManifest(PACKAGE_DIR, published).problems[0]).toMatch(/needs a new version/);
  });

  it("proves a copy is the version a site recorded, and names every difference", () => {
    const copy = mkdtempSync(join(tmpdir(), "source-intake-copy-"));
    try {
      cpSync(PACKAGE_DIR, copy, { recursive: true });
      expect(verifyPackageCopy(copy, { expect: manifest.treeSha256 }).ok).toBe(true);

      writeFileSync(join(copy, "src", "verify.ts"), "// edited\n", { flag: "a" });
      writeFileSync(join(copy, "src", "extra.ts"), "export {};\n");
      rmSync(join(copy, "template", "source-intake.yml"));
      const result = verifyPackageCopy(copy, { expect: manifest.treeSha256 });
      expect(result.ok).toBe(false);
      expect(result.problems).toEqual(
        expect.arrayContaining([
          `src/verify.ts differs from version ${manifest.version}`,
          "template/source-intake.yml is missing",
          `src/extra.ts is not part of version ${manifest.version}`,
          expect.stringMatching(/the site recorded/),
        ]),
      );
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("gives the digest a shell recomputes with sha256sum", () => {
    if (spawnSync("sha256sum", ["--version"]).status !== 0) return;
    const recipe =
      "find . -type f ! -path './MANIFEST.json' ! -path '*/node_modules/*' | sed 's#^\\./##' | LC_ALL=C sort | " +
      "while read -r f; do printf '%s  %s\\n' \"$(sha256sum \"$f\" | cut -d' ' -f1)\" \"$f\"; done | sha256sum | cut -d' ' -f1";
    const shell = spawnSync("bash", ["-c", recipe], { cwd: PACKAGE_DIR, encoding: "utf8" });
    expect(shell.stdout.trim()).toBe(treeDigest(hashPackageFiles(PACKAGE_DIR)));
  });
});
