/**
 * Step `prepare --article <id> --product-repo-path <path>` — turns a ShortsOS editorial brief
 * (`textos/briefs/<id>.json`) into a TextOS CTC intake, then hands it to TextOS's own CTC adapter
 * and exports every slot prompt TextOS would send to a writer.
 *
 *  1. Evidence is built from the brief, never typed freehand: every excerpt must be a VERBATIM
 *     quote (whitespace-normalized) of a product commit message, a product file at the pinned ref,
 *     or a field of the pinned Public Truth manifest. The product checkout must sit at the pinned
 *     ref, and every cited commit must be in its history (`git merge-base --is-ancestor`);
 *     `content:commits` then records the cited commits in the public ledger the site checks.
 *  2. Approval and public-use clearance go through TextOS's own `approveEvidenceForUse` and
 *     `clearEvidenceForPublicUse`, with their invariant checks. Who decided what is taken from the
 *     brief and recorded as-is; a clearance is only applied where the brief names a real, recorded
 *     human decision.
 *  3. `adaptCtcIntakeToExecutionPlan` (TextOS) builds and validates the plan and its hashes.
 *  4. For each slot, `resolveSlotEvidence` + `buildSlotPrompt` (TextOS) produce the exact prompt;
 *     it is written under `textos/runs/<id>/prompts/`. `write` refuses any response written
 *     against a prompt that no longer matches.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { TEXTOS_DIR, SITE_ROOT, argValue, loadTextos, readJson, sha256, writeJson, writeText } from "./lib";
import type { EvidenceApprovalDecision, EvidenceClearanceDecision } from "./lib";
import type {
  ApprovedEvidenceItem,
  ClaimProfile,
  CtcGeoWriterIntake,
  CtcGeoWriterProvenance,
  GeoWriterSlot,
  MentionedEntity,
  GenerationPolicy,
} from "./textos-contracts";
import { promptFileName, type ArticleBrief, type BriefEvidence } from "../../../src/lib/textos/brief";

const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();

interface ProductCommit {
  sha: string;
  date: string;
  subject: string;
}

/** A cited product commit, read from the product checkout. Briefs cite full SHAs, and only commits
 *  in the history of the pinned ref: anything else is refused. */
function productCommit(productRepo: string, productRef: string, cited: string): ProductCommit {
  if (!/^[0-9a-f]{40}$/.test(cited)) throw new Error(`prepare: briefs cite full 40-hex SHAs (got ${cited}).`);
  const ancestry = spawnSync("git", ["-C", productRepo, "merge-base", "--is-ancestor", cited, productRef], { encoding: "utf8" });
  if (ancestry.status !== 0) throw new Error(`prepare: ${cited} is not in the history of the pinned product ref ${productRef}.`);
  const [sha, date, subject] = execFileSync("git", ["-C", productRepo, "log", "-1", "--format=%H%x1f%aI%x1f%s", cited], { encoding: "utf8" })
    .trim()
    .split("\x1f");
  if (sha !== cited || !date || subject === undefined) throw new Error(`prepare: could not read commit ${cited}.`);
  return { sha, date, subject };
}

interface ManifestEntity {
  id: string;
  claimCeiling: string;
  prohibitedClaims: string[];
  knownLimits: string[];
}

async function main(): Promise<void> {
  const articleId = argValue("--article");
  const productRepo = argValue("--product-repo-path");
  if (!articleId) throw new Error("prepare: --article <id> is required.");
  if (!productRepo || !existsSync(join(productRepo, ".git"))) {
    throw new Error("prepare: --product-repo-path <full clone of the ShortsOS product repository> is required.");
  }

  const brief = readJson<ArticleBrief>(join(TEXTOS_DIR, "briefs", `${articleId}.json`));
  if (brief.articleId !== articleId) throw new Error(`prepare: brief file ${articleId}.json declares articleId ${brief.articleId}.`);

  const { productRef } = readJson<{ productRef: string }>(join(SITE_ROOT, "content-bundles", "inputs", "pin.json"));
  const head = execFileSync("git", ["-C", productRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== productRef) {
    throw new Error(`prepare: product checkout is at ${head}, the manifest pin is ${productRef}. It is never checked out for you.`);
  }
  const tip = productCommit(productRepo, productRef, productRef);
  const manifest = readJson<{ entities: ManifestEntity[] }>(join(SITE_ROOT, "content-bundles", "inputs", "manifest.json"));

  const client = readJson<{ generationPolicy: GenerationPolicy; roster: MentionedEntity[] }>(
    join(TEXTOS_DIR, "client", "client-profile.json"),
  );
  const claimProfile = readJson<ClaimProfile>(join(TEXTOS_DIR, "client", "claim-profile.json"));

  // ── 1. Evidence, verbatim from its source ──────────────────────────────────────────────────
  const rawEvidence: ApprovedEvidenceItem[] = brief.evidence.map((ev: BriefEvidence) => {
    const quote = normalizeWs(ev.source.quote);
    let sourceTitle: string;
    let sourcePublisher: string;
    let retrievedAt: string;
    if (ev.source.kind === "product_commit") {
      const commit = productCommit(productRepo, productRef, ev.source.sha);
      const body = normalizeWs(execFileSync("git", ["-C", productRepo, "show", "-s", "--format=%B", commit.sha], { encoding: "utf8" }));
      if (!body.includes(quote)) {
        throw new Error(`prepare: ${ev.id} quote is not verbatim in the message of ${commit.sha}:\n  «${quote}»`);
      }
      sourceTitle = `ShortsOS product commit ${commit.sha.slice(0, 7)}: ${commit.subject}`;
      sourcePublisher = "ShortsOS product repository (gangster-nerd/shortsos-v0), canonical main";
      retrievedAt = commit.date;
    } else if (ev.source.kind === "product_file") {
      const content = normalizeWs(execFileSync("git", ["-C", productRepo, "show", `${productRef}:${ev.source.path}`], { encoding: "utf8" }));
      if (!content.includes(quote)) {
        throw new Error(`prepare: ${ev.id} quote is not verbatim in ${ev.source.path} at ${productRef}:\n  «${quote}»`);
      }
      sourceTitle = `ShortsOS product repository file ${ev.source.path} at ${productRef.slice(0, 7)}`;
      sourcePublisher = "ShortsOS product repository (gangster-nerd/shortsos-v0), canonical main";
      retrievedAt = tip.date;
    } else {
      const src = ev.source;
      const entity = manifest.entities.find((e) => e.id === src.entityId);
      if (!entity) throw new Error(`prepare: ${ev.id} names unknown manifest entity ${src.entityId}.`);
      const field = entity[src.field];
      const values = (Array.isArray(field) ? field : [field]).map(normalizeWs);
      if (!values.some((v) => v.includes(quote))) {
        throw new Error(`prepare: ${ev.id} quote is not verbatim in ${entity.id}.${src.field}:\n  «${quote}»`);
      }
      sourceTitle = `ShortsOS Public Truth manifest, ${entity.id}.${src.field}`;
      sourcePublisher = "ShortsOS product repository (gangster-nerd/shortsos-v0), ratified public-truth declaration";
      retrievedAt = tip.date;
    }
    return {
      id: ev.id,
      kind: "official_brand_evidence",
      sourceUrl: null,
      sourceTitle,
      sourcePublisher,
      retrievedAt,
      contentHash: sha256(quote),
      excerpt: quote,
      subject: { kind: "tracked_brand", name: "ShortsOS" },
      claimTypes: ev.claimTypes,
      maxSupportStrength: ev.maxSupportStrength,
      limitations: ev.limitations,
      epistemicStatus: "operator_supplied",
      publicUse: "pending",
      approvedForGeneration: false,
      approvedBy: null,
      approvedAt: null,
      approvalScope: { briefIds: [], locale: brief.locale, channel: "internal_demo" },
    };
  });

  // ── 2. Approval and clearance — TextOS's own transitions ─────────────────────────────────────
  const textos = await loadTextos();
  const approvalDecision: EvidenceApprovalDecision = {
    briefIds: [brief.articleId],
    locale: brief.locale,
    channel: brief.publicationChannel,
    approvedBy: brief.approval.approvedBy,
    approvedAt: brief.approval.approvedAt,
  };
  const receipts: unknown[] = [];
  const evidence = rawEvidence.map((item) => {
    const approved = textos.approveEvidenceForUse(item, approvalDecision);
    if (!approved.approved) throw new Error(`prepare: TextOS refused approval of ${item.id}: ${approved.reason}`);
    const approvalViolations = textos.approvalInvariantViolations(item, approved.item);
    if (approvalViolations.length > 0) throw new Error(`prepare: approval invariants broken for ${item.id}: ${approvalViolations.join("; ")}`);

    const clearance = brief.clearances.find((c) => c.evidenceIds.includes(item.id));
    if (!clearance) return approved.item;
    const decision: EvidenceClearanceDecision = {
      evidenceId: item.id,
      decision: clearance.decision,
      clientValidation: clearance.clientValidation,
      actor: clearance.actor,
      actorCapacity: clearance.actorCapacity,
      decidedAt: clearance.decidedAt,
      scope: { channel: brief.publicationChannel, candidateId: brief.articleId },
      canonicalProductSha: productRef,
      reason: clearance.reason,
    };
    const cleared = textos.clearEvidenceForPublicUse(approved.item, decision);
    if (!cleared.cleared) throw new Error(`prepare: TextOS refused clearance of ${item.id}: ${cleared.reason}`);
    const clearanceViolations = textos.clearanceInvariantViolations(approved.item, cleared.item);
    if (clearanceViolations.length > 0) throw new Error(`prepare: clearance invariants broken for ${item.id}: ${clearanceViolations.join("; ")}`);
    receipts.push(cleared.receipt);
    return cleared.item;
  });

  const publicationContext = { channel: brief.publicationChannel, briefId: brief.articleId, locale: brief.locale } as CtcGeoWriterIntake["publicationContext"];
  const usability = evidence.map((item) => ({ evidenceId: item.id, ...textos.evaluateEvidenceUsability(item, publicationContext) }));
  const unusable = usability.filter((u) => !u.usable);
  if (unusable.length > 0) {
    throw new Error(`prepare: evidence not usable on ${brief.publicationChannel}: ${unusable.map((u) => `${u.evidenceId} (${u.reason})`).join("; ")}`);
  }

  // ── 3. Intake → TextOS CTC adapter ────────────────────────────────────────────────────────────
  const provenance: CtcGeoWriterProvenance = { ...brief.provenance, canonicalProductSha: productRef };
  for (const group of provenance.ctcSourceGroups) {
    for (const sha of group.sourceCommits) productCommit(productRepo, productRef, sha);
  }
  const intake: CtcGeoWriterIntake = {
    provenance,
    locale: brief.locale,
    policy: client.generationPolicy,
    publicationContext,
    claimProfile,
    roster: client.roster,
    evidence,
    slots: brief.slots,
  };
  const adapted = textos.adaptCtcIntakeToExecutionPlan(intake);

  const runDir = join(TEXTOS_DIR, "runs", brief.articleId);
  writeJson(join(runDir, "intake.json"), intake);
  writeJson(join(runDir, "clearance-receipts.json"), receipts);
  writeJson(join(runDir, "evidence-usability.json"), usability);

  // ── 4. Slot prompts, exactly as TextOS renders them ──────────────────────────────────────────
  const promptHashes: Record<string, string> = {};
  for (const slot of adapted.plan.slots as GeoWriterSlot[]) {
    const { usable } = textos.resolveSlotEvidence(adapted.plan, slot);
    const prompt = textos.buildSlotPrompt({
      planId: adapted.plan.planId,
      locale: adapted.plan.locale,
      targetQuery: adapted.plan.targetQuery,
      slot,
      usableEvidence: usable,
    });
    const hash = sha256(`${prompt.system}\n\n${prompt.user}`);
    promptHashes[slot.id] = hash;
    writeText(
      join(runDir, "prompts", promptFileName(slot.id)),
      `<!-- prompt sha256: ${hash} — rendered by TextOS buildSlotPrompt at ${process.env.TEXTOS_REF} -->\n\n` +
        `## system\n\n${prompt.system}\n\n## user\n\n${prompt.user}\n`,
    );
  }
  writeJson(join(runDir, "adapt.json"), {
    textosRef: process.env.TEXTOS_REF,
    adapterMethodVersion: adapted.adapterMethodVersion,
    planId: adapted.plan.planId,
    executionPlanHash: adapted.executionPlanHash,
    ctcHandoffHash: adapted.ctcHandoffHash,
    promptHashes,
  });

  console.log(`prepare: ${brief.articleId} ready.`);
  console.log(`  channel:           ${brief.publicationChannel}`);
  console.log(`  evidence:          ${evidence.length} (${receipts.length} cleared for public use)`);
  console.log(`  executionPlanHash: ${adapted.executionPlanHash}`);
  console.log(`  slots:             ${adapted.plan.slots.map((s) => s.id).join(", ")}`);
}

await main();
