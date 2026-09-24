import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { checkCopySafety } from "../src/lib/safety/copy-safety";
import { FLOW_SURFACE, type ArticleBrief } from "../src/lib/textos/brief";
import {
  ArticleIntegrityError,
  defaultArticleContext,
  loadArticle,
  loadInsightArticles,
  readBriefs,
} from "../src/lib/textos/articles";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const ctx = defaultArticleContext(REPO_ROOT);
const articles = loadInsightArticles(ctx);
const briefs = readBriefs(REPO_ROOT);

/** A throwaway copy of the committed artefacts, so a test can tamper with one file. */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "sos-textos-"));
  cpSync(join(REPO_ROOT, "textos"), join(dir, "textos"), { recursive: true });
  return dir;
}
const sandboxes: string[] = [];
afterAll(() => sandboxes.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("TextOS-produced articles (SOS-NOTES-V1)", () => {
  it("publishes every brief that carries a publication record, from both flows", () => {
    expect(articles.map((a) => a.articleId).sort()).toEqual(briefs.filter((b) => b.publication).map((b) => b.articleId).sort());
    expect(new Set(articles.map((a) => a.flow))).toEqual(new Set(["commit_to_content", "site_intelligence"]));
  });

  it("maps each flow to its own manifest surface and channel", () => {
    for (const a of articles) {
      expect(a.surface).toBe(FLOW_SURFACE[a.flow]);
      expect(a.route).toBe(`/insights/${a.slug}/`);
    }
    // Commit-derived facts carry no human public-use clearance yet: preview channel only.
    expect(articles.filter((a) => a.flow === "commit_to_content").every((a) => a.channel === "controlled_preview")).toBe(true);
    // Answers rest only on ratified, client-validated wording: checked for public_web.
    expect(articles.filter((a) => a.flow === "site_intelligence").every((a) => a.channel === "public_web")).toBe(true);
  });

  it("answers only name capabilities that authorize a public claim on the faq surface", () => {
    for (const a of articles.filter((x) => x.surface === "faq")) {
      for (const e of a.entityStatuses) {
        expect(e.status).toBe("public_marketable");
        expect(e.allowedSurfaces).toContain("faq");
      }
    }
  });

  it("passes the site's copy-safety check against the pinned manifest", () => {
    const sources = articles.map((a) => ({
      id: `insight:${a.articleId}`,
      text: a.allText.join("\n"),
      relatedEntityIds: a.entityStatuses.map((e) => e.id),
    }));
    expect(checkCopySafety(sources, ctx.manifest)).toEqual([]);
  });

  it("never names the tool it was written with on a public page", () => {
    for (const a of articles) {
      expect(a.allText.join(" ")).not.toMatch(/textos/i);
    }
    const pageDir = join(REPO_ROOT, "src", "app", "insights");
    const files = [join(pageDir, "page.tsx"), join(pageDir, "[slug]", "page.tsx")];
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(/textos(?!\/articles)/i);
    }
  });

  it("names only commits that are in the product's publishable history", () => {
    for (const a of articles) {
      expect(a.sourceCommits.length).toBeGreaterThan(0);
      for (const c of a.sourceCommits) expect(c.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("CMO surface polish: conversion plan and next steps", () => {
  const byId = new Map(articles.map((a) => [a.articleId, a]));

  it("derives next steps from the pinned surface polish, with no commercial slot on any page", () => {
    for (const a of articles) {
      const plan = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "runs", a.articleId, "conversion-plan.json"), "utf8")) as {
        tool: { sha: string };
        inputs: { commercialCapability: string };
        plan: { commercial: { enabled: boolean } };
      };
      expect(plan.tool.sha).toBe(ctx.pinnedSurfacePolishSha);
      expect(plan.inputs.commercialCapability).toBe("unconfigured");
      expect(plan.plan.commercial.enabled).toBe(false);
    }
    // The pinned ranking on this corpus: shared topic and capability pair the two answers and the
    // two claim-governance notes; the footage note shares nothing, so it gets no next step.
    expect(Object.fromEntries(articles.map((a) => [a.articleId, a.nextStep?.targetArticleId ?? null]))).toEqual({
      "sos-answer-human-review": "sos-answer-what-a-pilot-involves",
      "sos-answer-what-a-pilot-involves": "sos-answer-human-review",
      "sos-note-evidence-repair": "sos-note-one-public-claim",
      "sos-note-one-public-claim": "sos-note-evidence-repair",
      "sos-note-zero-is-an-answer": null,
    });
  });

  it("shows each target as it reads, and never lowers a page's channel", () => {
    for (const a of articles.filter((x) => x.nextStep)) {
      const target = byId.get(a.nextStep!.targetArticleId)!;
      expect(a.nextStep).toEqual({ targetArticleId: target.articleId, route: target.route, label: target.title, description: target.description });
      if (a.channel === "public_web") expect(target.channel).toBe("public_web");
    }
  });
});

describe("integrity failures are refused, not rendered", () => {
  const brief = briefs.find((b) => b.articleId === "sos-note-evidence-repair")!;

  it("refuses a sentence edited after the check (document no longer matches its receipt)", () => {
    const dir = sandbox();
    sandboxes.push(dir);
    const file = join(dir, "textos", "runs", brief.articleId, "content-document.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("Six of the records", "Seven of the records"));
    expect(() => loadArticle(brief, { ...ctx, root: dir })).toThrow(ArticleIntegrityError);
  });

  it("refuses a run written with a different TextOS than the pinned one", () => {
    expect(() => loadArticle(brief, { ...ctx, pinnedTextosSha: "0".repeat(40) })).toThrow(/pinned tool/);
  });

  it("refuses to let the site become indexable while a preview-only article is published", () => {
    expect(() => loadArticle(brief, { ...ctx, indexingAllowed: true })).toThrow(/re-run it for public_web/);
  });

  it("refuses a developer note that restates a capability's claim ceiling", () => {
    const m1 = ctx.manifest.entities.find((e) => e.id === "M1-REAL-PRODUCE-REVIEW-PUBLISH")!;
    const manifest = {
      ...ctx.manifest,
      entities: ctx.manifest.entities.map((e) =>
        e.id === m1.id ? { ...e, claimCeiling: "How ShortsOS repaired evidence records that pointed at vanished commits. For pilots, x." } : e,
      ),
    };
    expect(() => loadArticle(brief, { ...ctx, manifest })).toThrow(/claim ceiling/);
  });

  it("refuses a faq-surface answer that names a capability not cleared for faq", () => {
    const answer = briefs.find((b) => b.flow === "site_intelligence")!;
    const tampered: ArticleBrief = { ...answer, entityIds: [...answer.entityIds, "JSON2VIDEO-NATIVE-RENDER-V1"] };
    expect(() => loadArticle(tampered, ctx)).toThrow(/does not authorize a public claim on faq/);
  });

  it("refuses a conversion plan that carries a commercial slot", () => {
    const dir = sandbox();
    sandboxes.push(dir);
    const file = join(dir, "textos", "runs", brief.articleId, "conversion-plan.json");
    const plan = JSON.parse(readFileSync(file, "utf8")) as { plan: { commercial: { enabled: boolean } } };
    plan.plan.commercial.enabled = true;
    writeFileSync(file, JSON.stringify(plan));
    expect(() => loadArticle(brief, { ...ctx, root: dir })).toThrow(/commercial slot/);
  });

  it("refuses a conversion plan from another tool than the pinned surface polish", () => {
    expect(() => loadArticle(brief, { ...ctx, pinnedSurfacePolishSha: "0".repeat(40) })).toThrow(/pinned surface polish/);
  });

  it("refuses a public_web answer whose next step is a preview-only note, even shown as it reads", () => {
    const dir = sandbox();
    sandboxes.push(dir);
    const note = articles.find((a) => a.articleId === brief.articleId)!;
    const file = join(dir, "textos", "runs", "sos-answer-human-review", "conversion-plan.json");
    const plan = JSON.parse(readFileSync(file, "utf8")) as { editorialNextStep: Record<string, string> };
    plan.editorialNextStep = { ...plan.editorialNextStep, targetArticleId: note.articleId, route: note.route, label: note.title, description: note.description };
    writeFileSync(file, JSON.stringify(plan));
    expect(() => loadInsightArticles({ ...ctx, root: dir })).toThrow(/only for controlled_preview/);
  });

  it("refuses a next step that does not show its target as that article reads", () => {
    const dir = sandbox();
    sandboxes.push(dir);
    const file = join(dir, "textos", "runs", brief.articleId, "conversion-plan.json");
    const plan = JSON.parse(readFileSync(file, "utf8")) as { editorialNextStep: { label: string } };
    plan.editorialNextStep.label = "A better title than the article has";
    writeFileSync(file, JSON.stringify(plan));
    expect(() => loadInsightArticles({ ...ctx, root: dir })).toThrow(/as that article reads/);
  });

  it("refuses an unpublished brief", () => {
    const unpublished: ArticleBrief = { ...brief, publication: undefined };
    expect(() => loadArticle(unpublished, ctx)).toThrow(/no publication record/);
  });
});

describe("the TextOS client record", () => {
  const tool = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "tool.json"), "utf8")) as {
    writer: { sha: string };
    surfacePolish: { repository: string; sha: string };
  };

  it("pins full SHAs, and every committed run receipt names the pinned writer", () => {
    expect(tool.writer.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(tool.surfacePolish.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(tool.surfacePolish.repository).toBe("gangster-nerd/textos-site");
    for (const id of readdirSync(join(REPO_ROOT, "textos", "runs"))) {
      const receipt = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "runs", id, "receipt.json"), "utf8")) as {
        textos: { sha: string };
        slotProviderMethodVersion: string;
        humanReview: string;
      };
      expect(receipt.textos.sha).toBe(tool.writer.sha);
      // The provider identity says who actually wrote the slots — never the API model that did not run.
      expect(receipt.slotProviderMethodVersion).toMatch(/^operator:claude-code\|geo-writer-slot@/);
    }
  });

  it("commits a render-parity receipt from the pinned surface polish that checked every block of every article", () => {
    const receipt = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "surface-polish", "after", "render-parity.json"), "utf8")) as {
      tool: { sha: string };
      summary: { articles: number; passed: number };
      articles: { articleId: string; passed: boolean; blocksChecked: number; blocksInView: number; mutationCaught: boolean | null; titleMatches: boolean }[];
    };
    expect(receipt.tool.sha).toBe(tool.surfacePolish.sha);
    expect(receipt.articles.map((a) => a.articleId).sort()).toEqual(articles.map((a) => a.articleId).sort());
    expect(receipt.summary).toEqual({ articles: articles.length, passed: articles.length });
    for (const a of receipt.articles) {
      // Not vacuous: every block of the parity view was found and compared, and a one-word change was caught.
      expect(a.passed && a.titleMatches && a.mutationCaught === true).toBe(true);
      expect(a.blocksChecked).toBeGreaterThan(0);
      expect(a.blocksChecked).toBe(a.blocksInView);
    }
  });

  it("keeps operator question proposals in TextOS's own proposal contract", () => {
    const proposals = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "client", "operator-question-proposals.json"), "utf8")) as {
      scopeAliases: string[];
      locale: string;
      horizonDays: number;
      questions: Record<string, string>[];
    };
    expect(proposals.scopeAliases.length).toBeGreaterThan(0);
    expect(Number.isInteger(proposals.horizonDays) && proposals.horizonDays > 0).toBe(true);
    const INTENTS = ["brand_presence", "local_purchase", "comparison", "alternative", "proof_seeking", "customer_pain", "market_mapping"];
    const STAGES = ["problem_aware", "solution_aware", "supplier_shortlist", "vendor_validation"];
    for (const q of proposals.questions) {
      expect(Object.keys(q).sort()).toEqual(
        ["buyerStage", "commercialIntent", "demandExpression", "intent", "question", "rationale", "targetTransition"].sort(),
      );
      expect(INTENTS).toContain(q.intent);
      expect(STAGES).toContain(q.buyerStage);
      expect(["high", "medium", "low"]).toContain(q.commercialIntent);
      expect(["absent_to_cited", "cited_to_recommended", "hold_recommended"]).toContain(q.targetTransition);
    }
  });

  it("cites the committed Site Intelligence snapshot from every Site Intelligence brief", () => {
    const snapshot = JSON.parse(readFileSync(join(REPO_ROOT, "textos", "site-intelligence", "snapshot.json"), "utf8")) as {
      snapshotHash: string;
      pages: { normalizedUrl: string }[];
    };
    const observed = new Set(snapshot.pages.map((p) => p.normalizedUrl));
    for (const b of briefs.filter((x) => x.flow === "site_intelligence")) {
      expect(b.siteObservation?.snapshotHash).toBe(snapshot.snapshotHash);
      for (const url of b.siteObservation?.pagesConsulted ?? []) expect(observed.has(url)).toBe(true);
    }
  });
});
