import { describe, expect, it } from "vitest";

import {
  extractJsonLdBlocks,
  findForbiddenPhrasesInText,
  validateRootShape,
  validateRouteHtml,
} from "../scripts/validate-jsonld";

function wrapScript(json: string): string {
  return `<html><head><script type="application/ld+json">${json}</script></head><body></body></html>`;
}

describe("validateRootShape", () => {
  it("passes a valid single-entity object with @context and @type", () => {
    expect(validateRootShape({ "@context": "https://schema.org", "@type": "Organization", name: "ShortsOS" })).toEqual(
      [],
    );
  });

  it("passes a valid @graph wrapper where the root carries @context", () => {
    expect(
      validateRootShape({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "ShortsOS" },
          { "@type": "WebSite", name: "ShortsOS site" },
        ],
      }),
    ).toEqual([]);
  });

  it("passes a valid array of entities, each carrying its own @context and @type", () => {
    expect(
      validateRootShape([
        { "@context": "https://schema.org", "@type": "Organization", name: "A" },
        { "@context": "https://schema.org", "@type": "Organization", name: "B" },
      ]),
    ).toEqual([]);
  });

  it("skips an @id-only reference node (not required to carry @type or @context)", () => {
    expect(validateRootShape({ "@id": "https://example.com/thing" })).toEqual([]);
  });

  it("fails when @context is missing entirely", () => {
    const errors = validateRootShape({ "@type": "Organization", name: "ShortsOS" });
    expect(errors.some((e) => e.includes("@context"))).toBe(true);
  });

  it("fails when @type is missing on a non-reference node", () => {
    const errors = validateRootShape({ "@context": "https://schema.org", name: "ShortsOS" });
    expect(errors.some((e) => e.includes("@type"))).toBe(true);
  });

  it("fails on a bare string/number/null root — not an object or array", () => {
    expect(validateRootShape("just a string").length).toBeGreaterThan(0);
    expect(validateRootShape(42).length).toBeGreaterThan(0);
    expect(validateRootShape(null).length).toBeGreaterThan(0);
  });
});

describe("findForbiddenPhrasesInText", () => {
  it("finds a planted forbidden phrase, case-insensitively", () => {
    expect(findForbiddenPhrasesInText("Just Self-Serve your way to publishing.")).toContain("self-serve");
  });

  it("finds nothing in clean text", () => {
    expect(findForbiddenPhrasesInText("A human reviews every produced short before publish.")).toEqual([]);
  });

  it("finds French wording too", () => {
    expect(findForbiddenPhrasesInText('{"name":"Démarrez gratuitement"}')).toEqual(["démarrez gratuitement"]);
  });
});

describe("extractJsonLdBlocks", () => {
  it("extracts a single ld+json block from an HTML document", () => {
    const html = wrapScript('{"@context":"https://schema.org","@type":"Organization"}');
    const blocks = extractJsonLdBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0]!)).toEqual({ "@context": "https://schema.org", "@type": "Organization" });
  });

  it("returns an empty array for a route with no structured data", () => {
    expect(extractJsonLdBlocks("<html><body><p>No JSON-LD here.</p></body></html>")).toEqual([]);
  });
});

describe("validateRouteHtml (end-to-end per-route check)", () => {
  it("passes a route with valid JSON-LD", () => {
    const html = wrapScript('{"@context":"https://schema.org","@type":"Organization","name":"ShortsOS"}');
    const result = validateRouteHtml("/", html);
    expect(result.hasStructuredData).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails malformed JSON with a clear, file-naming error", () => {
    const html = wrapScript('{"@context": "https://schema.org", "@type": "Organization",}'); // trailing comma
    const result = validateRouteHtml("/broken/", html);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]!.route).toBe("/broken/");
    expect(result.failures[0]!.reason).toMatch(/invalid JSON/);
  });

  it("fails JSON-LD missing @context", () => {
    const html = wrapScript('{"@type":"Organization","name":"ShortsOS"}');
    const result = validateRouteHtml("/no-context/", html);
    expect(result.failures.some((f) => f.reason.includes("@context"))).toBe(true);
  });

  it("fails JSON-LD missing @type", () => {
    const html = wrapScript('{"@context":"https://schema.org","name":"ShortsOS"}');
    const result = validateRouteHtml("/no-type/", html);
    expect(result.failures.some((f) => f.reason.includes("@type"))).toBe(true);
  });

  it("fails when a forbidden phrase is injected inside a JSON-LD block", () => {
    const html = wrapScript(
      '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I self-serve?","acceptedAnswer":{"@type":"Answer","text":"Yes, self-serve today."}}]}',
    );
    const result = validateRouteHtml("/faq/", html);
    expect(result.failures.some((f) => f.reason.includes("forbidden phrase"))).toBe(true);
  });

  it("correctly skips (not flags) a route with no structured data at all", () => {
    const html = "<html><body><main><h1>Proof</h1><p>No JSON-LD on this page.</p></main></body></html>";
    const result = validateRouteHtml("/proof/", html);
    expect(result.hasStructuredData).toBe(false);
    expect(result.failures).toEqual([]);
  });
});
