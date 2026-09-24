/**
 * Step `render-parity --label <name> [--html-root <dir>] [--flat] [--site-commit <sha>] [--require-pass]`
 * — TextOS's A2R render-parity oracle (CMO surface polish, pinned as `surfacePolish` in
 * textos/tool.json) run on ShortsOS's exported article pages.
 *
 * The oracle compares each ContentDocument block's semantic tree (`data.mdast`) with the HTML
 * element that carries the same `data-cse-block-id`. The geo-writer bridge emits text-only blocks,
 * and the oracle skips a block without a tree: run on the committed documents as they are, it
 * would check nothing and pass. So this step checks a parity view of each document instead: its
 * visible blocks in render order, each section heading as a heading at the writer's level and each
 * text as a paragraph, taken verbatim from the committed resolved surface and writer lineage.
 *
 * It then proves the check is not vacuous: one word changed inside a checked block of the page must
 * be reported. The page title is compared too (a ShortsOS check: the oracle only covers the body).
 *
 * `--html-root` defaults to the static export (`out/`); `--flat` reads `<html-root>/<slug>.html`
 * instead, e.g. a saved copy of an earlier build. Writes `textos/surface-polish/<label>/render-parity.json`.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SITE_ROOT, TEXTOS_DIR, TEXTOS_REF, TEXTOS_ROOT, argValue, readJson, sha256, writeJson } from "./lib";
import { headingBlockId, type ArticleBrief } from "../../../src/lib/textos/brief";

interface ParityDiff {
  blockId: string;
  path: readonly (string | number)[];
  differenceKind: string;
  message: string;
  expected: unknown;
  actual: unknown;
}

interface ParityResult {
  passed: boolean;
  blocksChecked: number;
  diffs: ParityDiff[];
}

interface ResolvedSurface {
  blocks: { visible: boolean; order: number; block: { id: string; kind: string; data: { text?: string } } }[];
}

interface Lineage {
  slotProvenance: { slotId: string; heading: string | null; headingLevel: number | null }[];
}

type Cheerio = (selector: string) => { first(): { text(): string } };

async function cseModule<T>(relativePath: string): Promise<T> {
  return (await import(pathToFileURL(join(TEXTOS_ROOT, "lib", "content-surface-engine", relativePath)).href)) as T;
}

/** Changes one word inside the element marked `blockId`; null when the page carries no such marker. */
function mutateInsideBlock(html: string, blockId: string, text: string): string | null {
  const at = html.indexOf(`data-cse-block-id="${blockId}"`);
  const word = /[A-Za-z]{5,}/.exec(text)?.[0];
  if (at < 0 || !word) return null;
  const idx = html.indexOf(word, at);
  return idx < 0 ? null : `${html.slice(0, idx)}${word.toUpperCase()}${html.slice(idx + word.length)}`;
}

async function main(): Promise<void> {
  const label = argValue("--label");
  if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error("render-parity: --label <kebab-case name> is required.");
  const htmlRoot = resolve(argValue("--html-root") ?? join(SITE_ROOT, "out"));
  const flat = process.argv.includes("--flat");
  const siteCommitArg = argValue("--site-commit");
  const siteCommit = siteCommitArg ?? execFileSync("git", ["-C", SITE_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const treeDirty =
    siteCommitArg === null &&
    execFileSync("git", ["-C", SITE_ROOT, "status", "--porcelain", "--", "src", "public", "textos/briefs", "textos/runs"], {
      encoding: "utf8",
    }).trim().length > 0;
  const siteCommitNote = siteCommitArg
    ? "Saved copy of a build of siteCommit."
    : treeDirty
      ? "The checked build included uncommitted changes on top of siteCommit (the commit that lands them is the one carrying this receipt)."
      : "The checked build is exactly siteCommit.";

  const { evaluateRenderParity } = await cseModule<{
    evaluateRenderParity(input: { document: unknown; html: string }): ParityResult;
  }>("conformance/render-parity/evaluate-render-parity.ts");
  const { loadArticleFragment } = await cseModule<{ loadArticleFragment(html: string): Cheerio }>(
    "conformance/render-parity/html-projection.ts",
  );

  const briefs = readdirSync(join(TEXTOS_DIR, "briefs"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson<ArticleBrief>(join(TEXTOS_DIR, "briefs", f)))
    .filter((b) => b.publication !== undefined);

  const articles = briefs.map((brief) => {
    const runDir = join(TEXTOS_DIR, "runs", brief.articleId);
    const document = readJson<{ identity: { title: string } }>(join(runDir, "content-document.json"));
    const resolved = readJson<ResolvedSurface>(join(runDir, "resolved-surface.json"));
    const slots = new Map(readJson<Lineage>(join(runDir, "lineage.json")).slotProvenance.map((s) => [s.slotId, s]));

    // The parity view: what the page must say, block for block, from the committed artefacts.
    const body: { id: string; kind: string; data: { mdast: unknown } }[] = [];
    for (const { block } of resolved.blocks.filter((b) => b.visible).sort((a, b) => a.order - b.order)) {
      const slot = slots.get(block.id);
      if (slot?.heading) {
        body.push({
          id: headingBlockId(block.id),
          kind: "heading",
          data: { mdast: { type: "heading", depth: slot.headingLevel ?? 2, children: [{ type: "text", value: slot.heading }] } },
        });
      }
      body.push({ id: block.id, kind: block.kind, data: { mdast: { type: "paragraph", children: [{ type: "text", value: block.data.text ?? "" }] } } });
    }
    const view = { ...document, body };

    const htmlPath = flat ? join(htmlRoot, `${brief.slug}.html`) : join(htmlRoot, "insights", brief.slug, "index.html");
    const html = readFileSync(htmlPath, "utf8");
    const result = evaluateRenderParity({ document: view, html });

    const probe = body.find((b) => b.kind !== "heading");
    const probeText = (probe?.data.mdast as { children: { value: string }[] } | undefined)?.children[0]?.value ?? "";
    const mutated = probe ? mutateInsideBlock(html, probe.id, probeText) : null;
    const mutationCaught = mutated === null ? null : !evaluateRenderParity({ document: view, html: mutated }).passed;

    const $ = loadArticleFragment(html);
    const renderedTitle = $("h1").first().text().replace(/\s+/g, " ").trim();

    return {
      articleId: brief.articleId,
      slug: brief.slug,
      htmlSha256: sha256(html),
      blocksInView: body.length,
      blocksChecked: result.blocksChecked,
      passed: result.passed,
      diffCount: result.diffs.length,
      diffs: result.diffs.slice(0, 12).map((d) => ({
        blockId: d.blockId,
        differenceKind: d.differenceKind,
        path: d.path,
        message: d.message,
      })),
      mutationCaught,
      titleMatches: renderedTitle === document.identity.title,
    };
  });

  const passed = articles.filter((a) => a.passed && a.mutationCaught === true && a.titleMatches).length;
  writeJson(join(TEXTOS_DIR, "surface-polish", label, "render-parity.json"), {
    receiptVersion: 1,
    label,
    tool: { repository: "gangster-nerd/textos-site", sha: TEXTOS_REF, function: "evaluateRenderParity (A2R-SURFACE-SEAL-1)" },
    observed: { siteCommit, siteCommitNote, layout: flat ? "saved copy (<slug>.html)" : "static export (out/insights/<slug>/index.html)" },
    method:
      "Parity view of each committed ContentDocument: visible resolved blocks in render order, section headings as mdast headings at the writer's level, texts as mdast paragraphs. Non-vacuity: one word changed inside a checked block must be reported. The rendered h1 must equal the document title.",
    summary: { articles: articles.length, passed },
    articles,
  });

  for (const a of articles) {
    const mutation = a.mutationCaught === null ? "n/a (no marker)" : a.mutationCaught ? "caught" : "MISSED";
    console.log(
      `render-parity [${label}]: ${a.articleId} ${a.passed ? "pass" : "FAIL"} — ${a.blocksChecked}/${a.blocksInView} blocks, ` +
        `${a.diffCount} diffs, mutation ${mutation}, title ${a.titleMatches ? "ok" : "differs"}`,
    );
  }
  console.log(`render-parity [${label}]: ${passed}/${articles.length} articles pass all three checks.`);
  if (process.argv.includes("--require-pass") && passed !== articles.length) process.exit(1);
}

await main();
