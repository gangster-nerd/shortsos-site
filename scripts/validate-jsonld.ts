#!/usr/bin/env tsx
/**
 * `npm run validate:jsonld` — deterministic, zero-network, zero-new-dependency validation of
 * the JSON-LD actually present in the exported static site (`out/`, produced by
 * `next build` under this repo's `output: "export"` config — see next.config.ts).
 *
 * This deliberately does NOT validate `src/lib/seo/json-ld.ts` (the builder) in isolation.
 * The builder passing its own unit tests proves nothing about what a page actually emits —
 * only the real exported HTML does. So this script walks every `.html` file under `out/`,
 * extracts every `<script type="application/ld+json">` block by regex (no HTML parser: this
 * site's own templates emit at most one simple, single-line JSON-LD `<script>` per page —
 * see the real output of `out/index.html` / `out/faq/index.html` inspected while building
 * this script — so a non-greedy `<script ...>...<\/script>` regex is exact here and a full
 * DOM parser would be unjustified extra weight/dependency for this repo), and validates each
 * block found.
 *
 * "Required @type" judgment call (documented per the mission's request): a JSON-LD node must
 * carry `@type` UNLESS it is a bare `@id`-only reference (an object whose only key is `@id`,
 * i.e. it points at another node rather than describing one). Any node with other properties
 * but no `@type` is a real gap and fails. `@context` must be present at the root, or at the
 * `@graph` wrapper level, or on every individual item that lacks it from its parent (a nested
 * item may carry its own `@context` override) — again matching ordinary JSON-LD practice,
 * kept as simple as this site's real output requires.
 *
 * Governed-route claim check: every JSON-LD block this script finds is scanned for the same
 * forbidden self-serve/unproven-scale/guaranteed-quality phrases that
 * `src/lib/safety/copy-safety.ts` already enforces against visible page copy (imported
 * directly from there — one list, never a second divergent copy). We do not special-case
 * "only M1-governed routes": today the only two routes that emit JSON-LD at all (`/` and
 * `/faq`) both render M1's own claim (via `getM1ForSurface`/`FAQ_ITEMS`, which are themselves
 * derived from the manifest), so scanning every JSON-LD block we find is equivalent to
 * scanning only the M1-governed ones — and copy-safety.ts's own doc comment already endorses
 * "a lint should be noisy/over-inclusive rather than miss a real violation" as this repo's
 * house philosophy, which this generalization follows.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_SELF_SERVE_PHRASES } from "../src/lib/safety/copy-safety";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(REPO_ROOT, "out");

const JSON_LD_SCRIPT_RE = /<script[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

export interface Failure {
  route: string;
  reason: string;
}

function ensureBuilt(): void {
  if (existsSync(OUT_DIR)) {
    return;
  }
  console.log("validate-jsonld: out/ does not exist yet — running `npm run build` first.");
  execSync("npm run build", { cwd: REPO_ROOT, stdio: "inherit" });
  if (!existsSync(OUT_DIR)) {
    console.error("validate-jsonld: FAIL — `npm run build` completed but out/ still does not exist.");
    process.exit(1);
  }
}

/** Recursively collects every `.html` file under `dir`, returned as absolute paths. */
export function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectHtmlFiles(full));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An object whose only key is `@id` is a bare reference to another node, not a described
 *  entity — it is not required to carry `@type` or `@context`. */
function isIdOnlyReference(node: Record<string, unknown>): boolean {
  const keys = Object.keys(node);
  return keys.length === 1 && keys[0] === "@id";
}

function validateEntity(node: unknown, path: string, hasInheritedContext: boolean, errors: string[]): void {
  if (!isPlainObject(node)) {
    errors.push(`${path}: entity is not a JSON object (got ${JSON.stringify(node)})`);
    return;
  }
  if (isIdOnlyReference(node)) {
    return;
  }
  const hasOwnContext = "@context" in node;
  if (!hasOwnContext && !hasInheritedContext) {
    errors.push(`${path}: no "@context" present (not on this node, and none inherited from a parent/@graph)`);
  }
  if (!("@type" in node)) {
    errors.push(`${path}: no "@type" present, and this node is not an @id-only reference`);
  }
}

/** Validates one parsed JSON-LD block's root shape: an object, an array of objects, or an
 *  object/array wrapping "@graph". Returns the list of validation errors (empty = valid). */
export function validateRootShape(parsed: unknown): string[] {
  const errors: string[] = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, i) => validateEntity(item, `root[${i}]`, false, errors));
    return errors;
  }

  if (!isPlainObject(parsed)) {
    errors.push(`root JSON-LD value must be an object or an array of objects, got ${JSON.stringify(parsed)}`);
    return errors;
  }

  if ("@graph" in parsed) {
    const graph = (parsed as Record<string, unknown>)["@graph"];
    const rootHasContext = "@context" in parsed;
    if (!Array.isArray(graph)) {
      errors.push(`root."@graph" must be an array, got ${JSON.stringify(graph)}`);
      return errors;
    }
    graph.forEach((item, i) => validateEntity(item, `root."@graph"[${i}]`, rootHasContext, errors));
    return errors;
  }

  validateEntity(parsed, "root", false, errors);
  return errors;
}

/** Scans the raw (unparsed) JSON-LD text for any of copy-safety.ts's forbidden phrases —
 *  catches a disallowed claim smuggled into structured data past the visible-copy checker. */
export function findForbiddenPhrasesInText(rawText: string): string[] {
  const lower = rawText.toLowerCase();
  return FORBIDDEN_SELF_SERVE_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

/** Extracts every `<script type="application/ld+json">` block's inner text from one HTML
 *  document. Exported so tests can exercise extraction without touching the filesystem. */
export function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  JSON_LD_SCRIPT_RE.lastIndex = 0;
  while ((match = JSON_LD_SCRIPT_RE.exec(html)) !== null) {
    blocks.push(match[1]!.trim());
  }
  return blocks;
}

/** Validates one route's HTML content. Returns per-block failures (empty = valid) and
 *  whether the route contained any structured data at all. */
export function validateRouteHtml(route: string, html: string): { failures: Failure[]; hasStructuredData: boolean } {
  const blocks = extractJsonLdBlocks(html);
  const failures: Failure[] = [];

  blocks.forEach((rawBlock, i) => {
    const label = blocks.length > 1 ? `${route} (block ${i + 1})` : route;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBlock);
    } catch (err) {
      failures.push({ route: label, reason: `invalid JSON — ${(err as Error).message}` });
      return;
    }

    const shapeErrors = validateRootShape(parsed);
    for (const reason of shapeErrors) {
      failures.push({ route: label, reason });
    }

    const forbiddenHits = findForbiddenPhrasesInText(rawBlock);
    for (const phrase of forbiddenHits) {
      failures.push({
        route: label,
        reason: `structured data contains forbidden phrase "${phrase}" (see src/lib/safety/copy-safety.ts)`,
      });
    }
  });

  return { failures, hasStructuredData: blocks.length > 0 };
}

function main(): void {
  ensureBuilt();

  const htmlFiles = collectHtmlFiles(OUT_DIR).sort();
  if (htmlFiles.length === 0) {
    console.error(`validate-jsonld: FAIL — no .html files found under ${OUT_DIR}.`);
    process.exit(1);
  }

  const failures: Failure[] = [];
  let routesWithStructuredData = 0;

  for (const file of htmlFiles) {
    const route = "/" + relative(OUT_DIR, file).split("\\").join("/");
    const html = readFileSync(file, "utf8");

    const { failures: routeFailures, hasStructuredData } = validateRouteHtml(route, html);
    if (hasStructuredData) {
      routesWithStructuredData += 1;
    }
    failures.push(...routeFailures);
  }

  if (failures.length > 0) {
    console.error("validate-jsonld: FAIL");
    for (const f of failures) {
      console.error(`  ${f.route}: ${f.reason}`);
    }
    process.exit(1);
  }

  console.log("validate-jsonld: OK");
  console.log(
    `  ${htmlFiles.length} routes scanned, ${routesWithStructuredData} contained structured data, all valid.`,
  );
}

// Only run as a CLI entrypoint (`tsx scripts/validate-jsonld.ts` / `npm run validate:jsonld`),
// never when this module is `import`-ed by the test suite — otherwise importing it for its
// pure helpers would trigger a real build + `process.exit`.
const isMainModule = process.argv[1] !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMainModule) {
  main();
}
