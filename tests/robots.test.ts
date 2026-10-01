import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";
import { SITE_ALLOWS_INDEXING, SITE_INVENTORY_AGENTS, SITE_ORIGIN } from "../src/lib/config/site-config";
import { robotsFor } from "../src/lib/seo/robots";

type Group = { userAgent: string; allow?: string; disallow?: string | string[] };

describe("robots.txt (SOS-TEXTOS-CLIENT-V1)", () => {
  it("while noindex: allows only the named inventory agents, disallows every other agent", () => {
    const groups = robotsFor(false).rules as Group[];
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

  it("while indexable: one group that allows every agent, and the sitemap on the official origin", () => {
    const result = robotsFor(true);
    expect(result.rules).toEqual([{ userAgent: "*", disallow: [], allow: "/" }]);
    expect(result.sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
    expect(SITE_ORIGIN).toBe("https://shortsos-site.vercel.app");
  });

  it("serves the state SITE_ALLOWS_INDEXING names", () => {
    expect(robots()).toEqual(robotsFor(SITE_ALLOWS_INDEXING));
  });

  it("names no search-engine crawler as an inventory agent", () => {
    for (const agent of SITE_INVENTORY_AGENTS) {
      expect(agent).not.toMatch(/google|bing|slurp|duckduck|baidu|yandex|gptbot|claudebot|perplexity|ccbot/i);
    }
  });
});
