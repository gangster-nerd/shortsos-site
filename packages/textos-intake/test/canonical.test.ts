import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJson, hashCanonical } from "../src/canonical";

/**
 * conformance/canonical-vectors.json holds values run through the TextOS API's own implementation
 * (`computedWith` names the repository, SHA and file); scripts/canonical-vectors.ts recomputes
 * them from a checkout at that SHA. If this package ever hashed differently, a site would reject
 * every genuine release — or recompute hashes TextOS never produced.
 */
const FILE = JSON.parse(readFileSync(join(import.meta.dirname, "..", "conformance", "canonical-vectors.json"), "utf8")) as {
  computedWith: { repository: string; sha: string; file: string };
  vectors: { name: string; value: unknown; canonical: string; sha256: string }[];
};

describe("canonical hashing matches the TextOS API", () => {
  it("names where its vectors were computed", () => {
    expect(FILE.computedWith.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(FILE.vectors.length).toBeGreaterThanOrEqual(10);
  });

  for (const vector of FILE.vectors) {
    it(vector.name, () => {
      expect(canonicalJson(vector.value)).toBe(vector.canonical);
      expect(hashCanonical(vector.value)).toBe(vector.sha256);
    });
  }

  it("does not depend on key order or formatting of what was received", () => {
    const a = JSON.parse('{"b":{"d":1,"c":[1,2]},"a":"x"}');
    const b = JSON.parse('{\n  "a": "x",\n  "b": { "c": [1, 2], "d": 1 }\n}');
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("refuses a value with no JSON form", () => {
    expect(() => hashCanonical(undefined)).toThrow(/no JSON form/);
  });
});
