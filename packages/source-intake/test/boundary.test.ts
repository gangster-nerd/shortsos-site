import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The package is meant to be copied as-is into other sites, and to receive from any source that
 * speaks the release protocol: it may import only its own files and Node built-ins (and vitest,
 * in its tests), declares no dependency, and names no product and no site — not in its code, its
 * tests, its templates, its conformance kit or its README. What a site receives from which
 * source lives in the site's own configuration.
 */
const PACKAGE_DIR = resolve(import.meta.dirname, "..");
const PRODUCT_OR_SITE = /textos|shortsos|\brepos\b|repos-site|jardiniers/i;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(full);
    return [full];
  });
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

describe("source-intake stays source- and site-agnostic", () => {
  const all = files(PACKAGE_DIR);
  const ts = all.filter((f) => f.endsWith(".ts"));

  it("imports only its own modules, node: built-ins, and vitest in tests", () => {
    expect(ts.length).toBeGreaterThan(10);
    for (const file of ts) {
      const rel = relative(PACKAGE_DIR, file);
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith("node:")) continue;
        if (specifier === "vitest" && rel.startsWith("test/")) continue;
        expect(specifier.startsWith("."), `${rel} imports ${specifier}`).toBe(true);
        const target = relative(PACKAGE_DIR, resolve(dirname(file), specifier));
        expect(target.startsWith(".."), `${rel} imports ${specifier}, outside the package`).toBe(false);
        if (rel.startsWith("src/")) expect(specifier.startsWith("./"), `${rel}: src/ imports only src/`).toBe(true);
      }
    }
  });

  it("declares no dependency", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("names no product and no site, in any file", () => {
    expect(all.length).toBeGreaterThan(40);
    // This file names them, to forbid them.
    for (const file of all.filter((f) => f !== import.meta.filename)) {
      const rel = relative(PACKAGE_DIR, file);
      expect(PRODUCT_OR_SITE.test(rel), rel).toBe(false);
      expect(readFileSync(file, "utf8"), rel).not.toMatch(PRODUCT_OR_SITE);
    }
  });
});
