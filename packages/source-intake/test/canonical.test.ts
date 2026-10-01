import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJson, hashCanonical } from "../src/canonical";

/**
 * conformance/canonical-vectors.json pins the protocol's hashing rule. If this package ever hashed
 * differently from a source, a site would reject every genuine release — or recompute hashes the
 * source never produced.
 */
const FILE = JSON.parse(readFileSync(join(import.meta.dirname, "..", "conformance", "canonical-vectors.json"), "utf8")) as {
  vectors: { name: string; value: unknown; canonical: string; sha256: string }[];
};

describe("canonical hashing follows the protocol's vectors", () => {
  it("has vectors for every part of the rule", () => {
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
