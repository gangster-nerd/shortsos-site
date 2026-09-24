#!/usr/bin/env tsx
/**
 * `npm run check:live [-- --base <url>]` — after a deployment, checks that the site actually
 * served matches what this commit says it serves (audit item E4): robots.txt and the sitemap, a
 * canonical URL, robots meta and share image on every sitemap page, the share images themselves,
 * llms.txt, the not-found page and the security headers.
 *
 * `--base` fetches from another address (a local server over `out/`, say) while every expected
 * URL stays on the official origin. Read-only: GET requests only, nothing is written anywhere.
 * Exits 1 when a check fails.
 */
import { NOT_FOUND_COPY } from "../src/content/copy-sources";
import { SITE_ALLOWS_INDEXING, SITE_ORIGIN } from "../src/lib/config/site-config";
import sitemap from "../src/app/sitemap";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx >= 0 ? process.argv[baseIdx + 1] : undefined) ?? SITE_ORIGIN;
/** Where to fetch an official URL from. */
const via = (url: string) => url.replace(SITE_ORIGIN, BASE.replace(/\/$/, ""));

async function get(url: string): Promise<{ status: number; type: string; body: string; headers: Headers }> {
  const res = await fetch(via(url), { redirect: "follow" });
  const type = res.headers.get("content-type") ?? "";
  const body = type.startsWith("image/") ? "" : await res.text();
  return { status: res.status, type, body, headers: res.headers };
}

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`);
  return re.exec(html)?.[1] ?? null;
}

async function main(): Promise<void> {
  console.log(`check-live: ${BASE}${BASE === SITE_ORIGIN ? "" : ` (standing in for ${SITE_ORIGIN})`}`);
  const expectedRobots = SITE_ALLOWS_INDEXING ? "index, follow" : "noindex, nofollow";

  const robots = await get(`${SITE_ORIGIN}/robots.txt`);
  check("robots.txt is served", robots.status === 200, `status ${robots.status}`);
  check(
    `robots.txt ${SITE_ALLOWS_INDEXING ? "allows" : "disallows"} every agent`,
    SITE_ALLOWS_INDEXING ? /User-Agent: \*\nAllow: \/\n/.test(robots.body) : /User-Agent: \*\nDisallow: \/\n/.test(robots.body),
  );
  check("robots.txt names the sitemap on the official origin", robots.body.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));

  const expected = sitemap().map((e) => e.url);
  const map = await get(`${SITE_ORIGIN}/sitemap.xml`);
  const listed = [...map.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  check("sitemap.xml lists exactly this commit's pages", JSON.stringify([...listed].sort()) === JSON.stringify([...expected].sort()), `${listed.length} listed, ${expected.length} expected`);

  const images = new Set<string>();
  for (const url of expected) {
    const page = await get(url);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(page.body)?.[1] ?? null;
    const image = meta(page.body, "property", "og:image");
    const problems = [
      page.status === 200 ? null : `status ${page.status}`,
      canonical === url ? null : `canonical ${canonical}`,
      meta(page.body, "name", "robots") === expectedRobots ? null : `robots ${meta(page.body, "name", "robots")}`,
      image?.startsWith(`${SITE_ORIGIN}/og/`) ? null : `og:image ${image}`,
    ].filter(Boolean);
    check(`page ${url.replace(SITE_ORIGIN, "")}`, problems.length === 0, problems.join(", "));
    if (image) images.add(image);
  }
  for (const image of images) {
    const res = await get(image);
    check(`share image ${image.replace(SITE_ORIGIN, "")}`, res.status === 200 && res.type === "image/png", `${res.status} ${res.type}`);
  }

  const llms = await get(`${SITE_ORIGIN}/llms.txt`);
  check("llms.txt is served as text", llms.status === 200 && llms.type.startsWith("text/plain"), `${llms.status} ${llms.type}`);

  const missing = await get(`${SITE_ORIGIN}/check-live-unknown-page/`);
  check("an unknown address answers 404 with the site's page", missing.status === 404 && missing.body.includes(NOT_FOUND_COPY.heading), `status ${missing.status}`);

  const home = await get(`${SITE_ORIGIN}/`);
  for (const header of ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"]) {
    check(`header ${header}`, home.headers.has(header), home.headers.get(header) ?? "missing");
  }
  if (BASE === SITE_ORIGIN) {
    check("header content-security-policy (production host)", home.headers.has("content-security-policy"));
  }

  for (const c of checks) console.log(`${c.ok ? "  ok  " : "  FAIL"} ${c.name}${!c.ok && c.detail ? ` — ${c.detail}` : ""}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`check-live: ${checks.length - failed}/${checks.length} checks pass.`);
  if (failed > 0) process.exit(1);
}

await main();
