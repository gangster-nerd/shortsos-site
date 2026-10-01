/**
 * Canonical JSON and its sha256 — the hashing rule of the release protocol: object keys sorted
 * recursively with the default sort (UTF-16 code units), array order kept, then `JSON.stringify`
 * without whitespace. Every hash a source hands out — an artifact's `sha256`, a receipt's
 * `inputHash`/`outputHash`, a decision's `actionEnvelopeHash` — is this function of a JSON value,
 * so a site recomputes each one from the JSON it received instead of trusting the number next to
 * it.
 *
 * Hashing with WebCrypto (async) or node:crypto (sync, here) gives the same bytes and the same
 * digest. conformance/canonical-vectors.json pins the rule; test/canonical.test.ts checks this
 * implementation against it.
 */
import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, normalize(object[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(normalize(value)) as string | undefined;
  if (json === undefined) throw new TypeError("canonicalJson: value has no JSON form");
  return json;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;
export const GIT_SHA = /^[0-9a-f]{40}$/;
