import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The package is meant to be copied as-is into other sites (RepOS-site, …): it may import only
 * its own files and Node built-ins, and declares no dependency.
 */
const PACKAGE_DIR = join(import.meta.dirname, "..");
const SRC_DIR = join(PACKAGE_DIR, "src");

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

describe("textos-intake stays site-agnostic", () => {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));

  it("imports only its own modules and node: built-ins", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const specifier of importsOf(readFileSync(join(SRC_DIR, file), "utf8"))) {
        expect(specifier.startsWith("./") || specifier.startsWith("node:"), `${file} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("declares no dependency", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("names no site", () => {
    for (const file of files) {
      expect(readFileSync(join(SRC_DIR, file), "utf8"), file).not.toMatch(/shortsos|repos-site|jardiniers/i);
    }
  });
});
