/**
 * Step `site-intelligence` — TextOS Site Intelligence (SITE-INTELLIGENCE-1, ADR-020) run on
 * ShortsOS's own site, exactly as TextOS runs it on a client's owned surface.
 *
 * ShortsOS-site has no public deployment yet (SITE_ORIGIN is a placeholder), so the observed
 * surface is its static export (`out/`, produced by `npm run build`) served read-only over HTTP on
 * a fixed local origin. TextOS's own live fetcher and crawler do everything else: robots.txt first
 * (the site's real robots.txt, which names the TextOS inventory agent — see site-config.ts),
 * declared sitemaps, root, internal links; same-origin only; one request per second.
 *
 * Writes `textos/site-intelligence/snapshot.json` (TextOS's SiteInventorySnapshot, verbatim) and
 * `receipt.json` (what was observed, from which build, with which TextOS). The raw HTML bodies are
 * not committed: they are this repository's own build output, reproducible from its commit.
 * `--out <name>` writes to `textos/site-intelligence/<name>/` instead, so a later observation (e.g.
 * after publication) never overwrites the snapshot that editorial decisions cite.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { SITE_ROOT, TEXTOS_DIR, TEXTOS_REF, argValue, loadTextos, writeJson } from "./lib";

const HOST = "127.0.0.1";
const PORT = 4317;
const OUT_DIR = join(SITE_ROOT, "out");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath: string): { file: string } | { redirect: string } | null {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
  const direct = join(OUT_DIR, clean);
  if (!direct.startsWith(OUT_DIR)) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return { file: direct };
  if (existsSync(join(direct, "index.html"))) {
    return clean.endsWith("/") ? { file: join(direct, "index.html") } : { redirect: `${clean}/` };
  }
  return null;
}

async function main(): Promise<void> {
  if (!existsSync(join(OUT_DIR, "index.html"))) {
    throw new Error("site-intelligence: no out/ build found — run `npm run build` first.");
  }
  const siteCommit = execFileSync("git", ["-C", SITE_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const siteTreeDirty = execFileSync("git", ["-C", SITE_ROOT, "status", "--porcelain", "--", "src", "public", "content-bundles"], {
    encoding: "utf8",
  }).trim().length > 0;

  const server = createServer((req, res) => {
    const target = resolveFile(req.url ?? "/");
    if (target && "redirect" in target) {
      res.writeHead(308, { Location: target.redirect });
      res.end();
      return;
    }
    if (!target) {
      res.writeHead(404, { "Content-Type": CONTENT_TYPES[".html"] });
      res.end(existsSync(join(OUT_DIR, "404.html")) ? readFileSync(join(OUT_DIR, "404.html")) : "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(target.file)] ?? "application/octet-stream" });
    res.end(readFileSync(target.file));
  });
  await new Promise<void>((ok) => server.listen(PORT, HOST, ok));

  try {
    const textos = await loadTextos();
    const rootUrl = `http://${HOST}:${PORT}/`;
    const crawlRunId = `shortsos-site-si-${siteCommit.slice(0, 12)}`;
    const policy = textos.makeCrawlPolicy({ maxPages: 60 });
    const { snapshot } = await textos.crawlSite({
      rootUrl,
      policy,
      fetcher: textos.createLiveFetcher(),
      crawlRunId,
      now: () => new Date().toISOString(),
    });

    const outName = argValue("--out");
    if (outName !== null && !/^[a-z0-9-]+$/.test(outName)) throw new Error("site-intelligence: --out must be a plain kebab-case name.");
    const outDir = outName ? join(TEXTOS_DIR, "site-intelligence", outName) : join(TEXTOS_DIR, "site-intelligence");
    writeJson(join(outDir, "snapshot.json"), snapshot);
    const s = snapshot as {
      snapshotHash: string;
      siteInventoryMethodVersion: string;
      counts: Record<string, number>;
      robotsStatus: { decision: string; reason: string };
      pages: { normalizedUrl: string; crawlState: string }[];
    };
    writeJson(join(outDir, "receipt.json"), {
      receiptVersion: 1,
      tool: { repository: "gangster-nerd/textos-v0", sha: TEXTOS_REF, capability: "SITE-INTELLIGENCE-1 (ADR-020)" },
      observedSurface: {
        description:
          "Static export (out/) of shortsos-site served read-only on a fixed local origin — the site has no public deployment yet.",
        rootUrl,
        siteCommit,
        siteCommitNote: siteTreeDirty
          ? "The observed build included uncommitted changes on top of siteCommit (the commit that lands them is the one carrying this receipt)."
          : "The observed build is exactly siteCommit.",
      },
      crawlRunId,
      snapshotHash: s.snapshotHash,
      siteInventoryMethodVersion: s.siteInventoryMethodVersion,
      robots: s.robotsStatus,
      counts: s.counts,
      pages: s.pages.map((p) => ({ normalizedUrl: p.normalizedUrl, crawlState: p.crawlState })),
    });

    console.log("site-intelligence: done.");
    console.log(`  snapshotHash:  ${s.snapshotHash}`);
    console.log(`  robots:        ${s.robotsStatus.decision}`);
    console.log(`  counts:        ${JSON.stringify(s.counts)}`);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
}

await main();
