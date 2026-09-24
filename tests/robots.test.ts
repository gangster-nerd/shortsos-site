import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";
import { SITE_ALLOWS_INDEXING, SITE_INVENTORY_AGENTS } from "../src/lib/config/site-config";

describe("robots.txt (SOS-TEXTOS-CLIENT-V1)", () => {
  it("while noindex: allows only the named inventory agents, disallows every other agent", () => {
    expect(SITE_ALLOWS_INDEXING).toBe(false);
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(true);
    const groups = rules as { userAgent: string; allow?: string; disallow?: string | string[] }[];

    const wildcard = groups.find((g) => g.userAgent === "*");
    expect(wildcard?.disallow).toBe("/");
    expect(wildcard?.allow).toBeUndefined();

    const named = groups.filter((g) => g.userAgent !== "*");
    expect(named.map((g) => g.userAgent)).toEqual([...SITE_INVENTORY_AGENTS]);
    for (const g of named) {
      expect(g.allow).toBe("/");
      expect(g.disallow).toBeUndefined();
    }
  });

  it("names no search-engine crawler as an inventory agent", () => {
    for (const agent of SITE_INVENTORY_AGENTS) {
      expect(agent).not.toMatch(/google|bing|slurp|duckduck|baidu|yandex|gptbot|claudebot|perplexity|ccbot/i);
    }
  });
});
