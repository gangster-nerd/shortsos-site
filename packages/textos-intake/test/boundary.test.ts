import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The package is meant to be copied as-is into other sites (RepOS-site, textos-site…): it may
 * import only its own files and Node built-ins (and vitest, in its tests), declares no
 * dependency, and names no site outside its templates' placeholder.
 */
const PACKAGE_DIR = resolve(import.meta.dirname, "..");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : tsFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

describe("textos-intake stays site-agnostic", () => {
  const files = tsFiles(PACKAGE_DIR);

  it("imports only its own modules, node: built-ins, and vitest in tests", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
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

  it("names no site in its code", () => {
    for (const file of files.filter((f) => !relative(PACKAGE_DIR, f).startsWith("test/"))) {
      expect(readFileSync(file, "utf8"), relative(PACKAGE_DIR, file)).not.toMatch(/shortsos|repos-site|jardiniers|textos-site/i);
    }
  });
});
