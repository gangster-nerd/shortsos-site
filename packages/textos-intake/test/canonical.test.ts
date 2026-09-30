import { describe, expect, it } from "vitest";

import { canonicalJson, hashCanonical } from "../src/canonical";

/**
 * Vectors computed with the TextOS API's own implementation (`@textos/api-foundation`
 * `integrity/canonical.ts` at textos-v0 a38a16a, `canonicalJson` + WebCrypto `hashCanonical`),
 * run read-only outside this repository. If these ever differ, a site would reject every
 * genuine release — or worse, recompute hashes TextOS never produced.
 */
const TEXTOS_VECTORS: { name: string; value: unknown; canonical: string; sha256: string }[] = [
  { name: "null", value: null, canonical: "null", sha256: "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b" },
  {
    name: "nested",
    value: { b: [3, { z: 1, a: "é" }], a: { y: true, x: null } },
    canonical: '{"a":{"x":null,"y":true},"b":[3,{"a":"é","z":1}]}',
    sha256: "96fc83bd877b66d5bb496cf7b5e319bc68afc0b98ae0884b747fe6a67c1478e3",
  },
  {
    name: "unicode",
    value: { clé: "Soumis n'est pas publié — « guillemets »", emoji: "✓" },
    canonical: '{"clé":"Soumis n\'est pas publié — « guillemets »","emoji":"✓"}',
    sha256: "382a56d4619f9e27c18e691969b973375addd34f14a3dadaaf66f6016d5777eb",
  },
  {
    name: "numbers",
    value: { int: 42, neg: -1.5, exp: 1e21, small: 0.000001 },
    canonical: '{"exp":1e+21,"int":42,"neg":-1.5,"small":0.000001}',
    sha256: "d3be2c6b6179a88500a7fa9f4ee99798b6bb26a94d6d12617c32ab3dcca51c9e",
  },
  {
    name: "array order is kept",
    value: [{ b: 1, a: 2 }, "x", [2, 1]],
    canonical: '[{"a":2,"b":1},"x",[2,1]]',
    sha256: "656babfd2a99bd5c4c33c66c21938a4587efaf69a3c211c37b927f9ea2b897da",
  },
  {
    name: "empty containers",
    value: { o: {}, a: [] },
    canonical: '{"a":[],"o":{}}',
    sha256: "9bee7ebfc94b459dacb8cbc72cb2900e61f0aa42189df18329f84f92568f4f89",
  },
];

describe("canonical hashing matches the TextOS API", () => {
  for (const vector of TEXTOS_VECTORS) {
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
