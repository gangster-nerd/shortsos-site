import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");

interface HeaderRule {
  source: string;
  has?: { type: string; value: string }[];
  headers: { key: string; value: string }[];
}

const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")) as { headers: HeaderRule[] };

/** The headers Vercel would send for a path on a host (every matching rule applies). */
function headersFor(path: string, host: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of config.headers) {
    if (!new RegExp(`^${rule.source}$`).test(path)) continue;
    if (rule.has && !rule.has.every((h) => h.type === "host" && new RegExp(`^${h.value}$`).test(host))) continue;
    for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

function cspDirectives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name!, values]),
  );
}

function sourceText(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((p) => (statSync(p).isDirectory() ? sourceText(p) : readFileSync(p, "utf8")))
    .join("\n");
}

const PRODUCTION = "shortsos-site.vercel.app";
const PREVIEW = "shortsos-site-git-some-branch-team.vercel.app";

describe("security headers (vercel.json)", () => {
  it("sends the baseline headers on every path, previews included", () => {
    for (const host of [PRODUCTION, PREVIEW]) {
      for (const path of ["/", "/insights/some-article/", "/og/site.png", "/llms.txt"]) {
        expect(headersFor(path, host)).toMatchObject({
          "Strict-Transport-Security": expect.stringMatching(/^max-age=\d{8,}/),
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "X-Frame-Options": "DENY",
          "Permissions-Policy": expect.stringContaining("camera=()"),
        });
      }
    }
  });

  it("enforces the content security policy on the production host only (previews keep Vercel's toolbar)", () => {
    expect(headersFor("/", PRODUCTION)["Content-Security-Policy"]).toBeDefined();
    expect(headersFor("/", PREVIEW)["Content-Security-Policy"]).toBeUndefined();
  });

  it("keeps the policy strict where the site allows it", () => {
    const csp = cspDirectives(headersFor("/", PRODUCTION)["Content-Security-Policy"]!);
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    // Next's static export inlines its bootstrap scripts; nothing else may run.
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("allows every destination the site's own code sends a visitor or a request to", () => {
    const csp = cspDirectives(headersFor("/", PRODUCTION)["Content-Security-Policy"]!);
    const src = sourceText(join(REPO_ROOT, "src"));
    if (/action=\{`mailto:/.test(src)) expect(csp["form-action"]).toContain("mailto:");
    if (src.includes("formspree.io")) {
      expect(csp["connect-src"]).toContain("https://formspree.io");
      expect(csp["form-action"]).toContain("https://formspree.io");
    }
  });
});
