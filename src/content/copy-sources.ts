/**
 * Registry of the site's own page copy, as plain text, for the copy-safety check to scan
 * (see `src/lib/safety/copy-safety.ts`). Every page that renders marketing/product copy
 * pulls its literal strings from here, so what is checked is exactly what is rendered.
 *
 * Grounding: the only capability entitled to a public claim on any surface is
 * M1-REAL-PRODUCE-REVIEW-PUBLISH (the sole `public_marketable` entity, real manifest at
 * `content-bundles/inputs/manifest.json`). Its `claimCeiling`/`prohibitedClaims` are read
 * live via `src/lib/content/m1.ts` and rendered directly by pages — they are NOT
 * hand-copied into this file, so there is exactly one source of truth for that wording.
 * Everything below is the SITE'S OWN framing prose around that one proven fact: it must
 * never assert self-service access, direct customer publishing, automatic/unreviewed
 * publishing, universal availability, repeated-volume proof, or guaranteed quality/virality
 * — the same eight things M1's own `prohibitedClaims` forbid.
 */
import type { CopySource } from "../lib/safety/copy-safety";
import { M1_ENTITY_ID } from "../lib/content/m1";

export const PIPELINE_NARRATIVE: { title: string; body: string; proven: boolean }[] = [
  {
    title: "Existing footage",
    body: "A client's raw footage — the material already sitting in their own storage — is the starting point. Nothing is generated from a prompt.",
    proven: false,
  },
  {
    title: "Inventory",
    body: "Footage is technically inspected (duration, resolution, audio presence) and organized into a searchable inventory, so nothing usable gets lost in a folder.",
    proven: false,
  },
  {
    title: "Understanding",
    body: "Each clip is analyzed for what it actually shows — the moments, not just the file names — to build a record of what evidence exists.",
    proven: false,
  },
  {
    title: "Evidence",
    body: "Every story candidate is tied back to the specific source moments that support it, with timestamps — so a decision can be checked against the footage, not taken on faith.",
    proven: false,
  },
  {
    title: "Story opportunities",
    body: "Candidate short-form stories are drafted from that evidence, never invented independently of it.",
    proven: false,
  },
  {
    title: "Human selection",
    body: "A person decides which opportunity is worth producing. This is a decision checkpoint, not an automatic pipeline.",
    proven: false,
  },
  {
    title: "Production",
    body: "The selected story is rendered into video, voiced, and captioned.",
    proven: false,
  },
  {
    title: "Review",
    body: "A human reviews the produced short before anything goes out. Every real run to date has included this checkpoint.",
    proven: false,
  },
  {
    title: "Publication",
    body: "When a client is genuinely ready, the reviewed short is published — with a captured, checkable permalink.",
    proven: true,
  },
];

export const HOME_INTRO =
  "ShortsOS turns a client's own raw footage into a produced, human-reviewed short — and, when " +
  "genuinely ready, gets it published with a captured permalink. The steps below are the shape " +
  "of the pipeline; the publication step is the one we have run for real, end to end.";

export const HOW_IT_WORKS_INTRO =
  "This is the same pipeline shown on the homepage, in more detail. Most of these stages are real, " +
  "shipped engineering inside ShortsOS — but only the final Produce → Review → Publish loop has been " +
  "run end to end against real providers, for a real client, with a captured result. That is the one " +
  "claim this page makes as proven; every earlier stage is described honestly as pipeline architecture, " +
  "not as a separately proven or independently available capability.";

export const METHODOLOGY_INTRO =
  "ShortsOS is operated, not self-directed: an agency team runs the pipeline on a client's behalf. This " +
  "page describes how that pipeline is architected internally — for transparency about the mechanism, " +
  "not as a menu of features available to a visitor. Most of what is described here is internal " +
  "engineering: implemented and tested, but not a capability a customer can invoke directly, and not " +
  "independently marketed as its own product claim.";

export const METHODOLOGY_STATUS_NOTE =
  "As of this program's most recent internal review, the underlying capability inventory behind this " +
  "pipeline is tracked on a four-way scale — proven-and-public, candidate, internal-only, and blocked " +
  "— and exactly one capability has cleared the bar for a public claim: the end-to-end Produce → " +
  "Review → Publish workflow described on the Proof page. Everything else described on this page is " +
  "internal architecture context, not an independent public claim.";

export const METHODOLOGY_STAGES: { name: string; note: string }[] = [
  { name: "Drive import & inventory", note: "Footage is imported from a client's own storage and organized into a technical inventory (duration, resolution, audio presence)." },
  { name: "Media understanding", note: "Clips are analyzed for what they show, building an evidence record used by every later stage." },
  { name: "Opportunity generation", note: "Candidate short-form stories are drafted from that evidence, with the source moments cited alongside each one." },
  { name: "Human decision checkpoint", note: "An operator reviews the candidate opportunities and their supporting evidence before anything is produced." },
  { name: "Production orchestration", note: "The selected opportunity moves through a durable, resumable job pipeline: render, voice, caption." },
  { name: "Render & caption providers", note: "Rendering and captioning are handled by third-party providers behind the pipeline; ShortsOS owns the orchestration and the content decisions, not the underlying video/caption engines." },
  { name: "Review", note: "A human reviews the produced short before publication — a mandatory checkpoint, not an optional one." },
  { name: "Publish & permalink capture", note: "When ready, the reviewed short is published and its permalink is captured and recorded." },
];

export const PROOF_INTRO =
  "This is the one thing ShortsOS has proven end to end, for real: a single client's raw footage " +
  "went through production, a human review, and publication — resulting in a live Instagram Reel " +
  "with a permalink we captured. It is one documented run, not a demonstration reel and not a repeated " +
  "or automated process.";

export const PROOF_WHAT_HAPPENED =
  "Source footage was rendered into a short, reviewed by a person, and published to a real, " +
  "operator-bound Instagram account. The published post's permalink was captured and stored as the " +
  "durable record of that publication. Two real adapter defects were found and fixed against the live " +
  "Instagram integration during this run — evidence that the run was against the real provider, not a " +
  "mock.";

export const PROOF_WHAT_THIS_IS_NOT =
  "This is not a portfolio of many published shorts, not a rendered demo reel, and not a claim about " +
  "how the finished video looks or performs. It is a record that the mechanism — from source footage " +
  "to a captured, checkable publication permalink — has actually run once, for real.";

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Can I connect my own Instagram account?",
    a: "Not yet. The one real publish we have run used a single account operated by the ShortsOS team. There is no independent account connection today.",
  },
  {
    q: "Can I publish directly myself, without going through ShortsOS?",
    a: "No. Publishing happens through the ShortsOS team as part of an operated pilot, not as something a customer triggers directly.",
  },
  {
    q: "Does ShortsOS publish automatically, without anyone reviewing it first?",
    a: "No. A human reviews every produced short before it is published. That review step has been part of every real run to date, and it is not optional.",
  },
  {
    q: "Is this available to anyone right now?",
    a: "No. ShortsOS is currently operated by the team for pilots — it is not a generally or instantly available product.",
  },
  {
    q: "Has this been done many times, or at scale?",
    a: "No. What is proven is one documented, real, end-to-end run. We do not claim production-scale or repeated-volume proof beyond that.",
  },
  {
    q: "Do you guarantee the video will be good, or that it will perform well?",
    a: "No. We make no guarantee of creative quality, performance, or virality for any published content.",
  },
  {
    q: "What exactly is proven, then?",
    a: "That the full Produce → Review → Publish workflow can run for real: source footage in, a real render, a human review, and a live Instagram Reel out, with its permalink captured.",
  },
  {
    q: "How do I actually start working with ShortsOS?",
    a: "Request a pilot. The ShortsOS team will follow up directly to scope a real engagement — there is no independent signup.",
  },
];

export const CHANGELOG_INTRO =
  "This is process/methodology history, not a customer-facing feature list. It records how ShortsOS's " +
  "own governance program decides what may be claimed publicly — not a log of shipped product features. " +
  "Every entry below is a historical statement about engineering or governance work that already happened, " +
  "cited by real commit and date in one of the two repositories behind this site. A historical entry about " +
  "a capability that is still `candidate`, `internal_only`, or `blocked` today describes past engineering " +
  "work only — never a current offer to use that capability.";

export interface ChangelogEntry {
  date: string;
  title: string;
  body: string;
  /** Which repository the cited commit lives in. */
  repo: "shortsos" | "shortsos-site";
  /** The real, git-verifiable commit SHA this entry is sourced from — never invented. */
  sha: string;
  /**
   * Every changelog entry is, by construction, a statement about the past. This flag is
   * carried explicitly (rather than left implicit) so the copy-safety/current-truth check
   * can assert, mechanically, that nothing in this array is ever read by a current-truth
   * page (`/`, `/how-it-works`, `/proof`, `/faq`, `/request-pilot`) — see
   * `tests/site-content.test.ts`.
   */
  historicalClaimOnly: true;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-09-24",
    title: "Insights opened: engineering notes and answers (SOS-NOTES-V1)",
    body: "Five articles were published under Insights. Three engineering notes, each written from cited product commits, record past engineering and governance work and claim no capability. Two answers take buyer questions this site did not yet answer in depth, and answer them only with wording the owner ratified for public use. Every article passed an automated claim check before publication; human editorial review of each one is pending.",
    repo: "shortsos-site",
    sha: "1a50fa8",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-24",
    title: "This site re-synced to the repaired product manifest (SOS-CTC-V3)",
    body: "The manifest this site is built from was re-pinned to the product commit that repaired its evidence citations. Only the evidence records of six capabilities changed: no publication status, claim wording or prohibited claim moved.",
    repo: "shortsos-site",
    sha: "2168cc7",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-16",
    title: "Evidence citations repaired after pinned commits vanished (T0-PUBLIC-TRUTH-BASELINE-REPAIR)",
    body: "Six evidence records behind the product's capability statuses cited commits that no longer existed in its history, so a fresh copy of the code could not verify them; one of them belonged to the capability ratified for the public claim. The citations were repointed or dropped. No claim wording, prohibited claim or publication status changed.",
    repo: "shortsos",
    sha: "36122a2c153228d74d03557da93b8d335360a5bf",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-14",
    title: "WAVE-012 admitted: FDTS Corpus Foundation (governance only)",
    body: "An engineering wave was admitted to build a tenant-safe ledger for large mixed photo and video imports. Admission only: the build had not started, and nothing here is an available feature.",
    repo: "shortsos",
    sha: "bd2523344f911b94afb4edad6b8818d6f0631a18",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-13",
    title: "M1 Produce → Review → Publish ratified as the one public claim (SOS-PUBLICATION-DECISION-M1-V1)",
    body: "Of nine internally-reviewed candidates, exactly one — the end-to-end Produce → Review → Publish workflow — was ratified for a public claim, with an explicit, narrow claim ceiling and eight prohibited-claim guardrails.",
    repo: "shortsos",
    sha: "f01ac6110ec664aba31ee985a4c30d307de10b2f",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-13",
    title: "This site synced to the ratified manifest (SOS-CATCHUP-V1)",
    body: "The public site you're reading was rebuilt from the ratified manifest: one public_marketable capability, eight still-candidate, thirty internal-only, three explicitly blocked from ever being claimed.",
    repo: "shortsos-site",
    sha: "1571d67",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-13",
    title: "Managed-service publication policy amended (SOS-PUBLIC-TRUTH-POLICY-V1)",
    body: "The publication policy was amended to allow an operator-run capability to be claimed publicly under a managed-service framing — never under independent-access wording.",
    repo: "shortsos",
    sha: "ea607bd",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-12",
    title: "Public Truth manifest introduced (SOS-PUBLIC-TRUTH-V1)",
    body: "ShortsOS's internal capability inventory was first classified on a four-way public/candidate/internal/blocked scale, fail-closed by default — every capability started internal-only until explicitly promoted.",
    repo: "shortsos",
    sha: "eb7446b",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-12",
    title: "\"Show Me Why\" capability chain closed (FDTS-SHOW-ME-WHY-V1)",
    body: "Internal engineering work, prior to this site's own governance train: the content-inventory UI was given real evidence controls, capture-session identity, and a durable zero-story state — the first capability in this program to be reviewed and closed across two consecutive missions. This was engineering-only work; no public claim followed from it.",
    repo: "shortsos",
    sha: "fd55820",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-12",
    title: "Opportunity generation wired to a real production caller (FDTS-OPPORTUNITY-CALLER-V1)",
    body: "Internal engineering history: the story-opportunity generator was connected to a real production LLM caller (previously a mock), closing out WAVE-006 of the earlier \"From Drive to Story\" build program. This is the same opportunity-generation stage later described, in past tense, on the /how-it-works page as pipeline architecture — it remains internal-only, not independently claimed here.",
    repo: "shortsos",
    sha: "d2268dc",
    historicalClaimOnly: true,
  },
  {
    date: "2026-09-11",
    title: "Tenant-safe duplicate-clip detection fixed (FDTS-RETRIEVAL-SAFETY-V1)",
    body: "A real defect — a media-probe lookup that did not scope duplicate detection by tenant — was found and fixed. Internal engineering record only; retrieval safety is not a capability marketed on this site.",
    repo: "shortsos",
    sha: "3803d15",
    historicalClaimOnly: true,
  },
  {
    date: "2026-06-21",
    title: "ShortsOS engineering begins (Sprint 0)",
    body: "The product repository's first commit: canonical docs, architecture decision records, and a target-architecture roadmap, months before any of the capabilities referenced elsewhere on this site existed in any form.",
    repo: "shortsos",
    sha: "e476b1c",
    historicalClaimOnly: true,
  },
];

export interface GlossaryEntry {
  term: string;
  definition: string;
  /**
   * true only for entries that describe a past engineering program, a sunset/superseded
   * name, or an internal mechanism recounted for historical color — never a live claim
   * about what a visitor can currently do or buy. false for the site's own live governance
   * vocabulary (still-accurate definitions of terms this site currently uses).
   */
  historicalClaimOnly: boolean;
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  { term: "Public Truth manifest", definition: "ShortsOS's internal, checksum-verified inventory of every capability and what may honestly be claimed about it publicly.", historicalClaimOnly: false },
  { term: "public_marketable", definition: "A capability that has cleared every gate to be claimed on a public surface. Exactly one capability holds this status today.", historicalClaimOnly: false },
  { term: "candidate", definition: "A capability that is real and implemented, but has not yet been reviewed and ratified for a public claim.", historicalClaimOnly: false },
  { term: "internal_only", definition: "A capability that exists and may be implemented, but makes no public claim of any kind — internal engineering only.", historicalClaimOnly: false },
  { term: "blocked", definition: "A concept explicitly prohibited from ever being claimed publicly, regardless of implementation status.", historicalClaimOnly: false },
  { term: "Claim ceiling", definition: "The exact, ratified upper bound of what may be said publicly about a capability — never exceeded, never blended with stronger wording.", historicalClaimOnly: false },
  { term: "Prohibited claims", definition: "An explicit list of specific things that must never be implied about a capability, even if the claim ceiling wording could be stretched to suggest them.", historicalClaimOnly: false },
  { term: "Operator-run / operator-bound", definition: "Run by the ShortsOS team on a client's behalf, on accounts and infrastructure the team controls — not operated directly by the client with their own credentials.", historicalClaimOnly: false },
  { term: "content:sync", definition: "The tool that reads the ratified manifest from the product repository and produces this site's own copy-safe content bundle.", historicalClaimOnly: false },
  { term: "Pilot", definition: "A direct, operator-run engagement with a client, requested through this site rather than started via independent signup.", historicalClaimOnly: false },
  { term: "Insights", definition: "The section of this site for articles written from the product's own record: engineering notes from product commits, and answers built only on ratified public wording.", historicalClaimOnly: false },
  { term: "Engineering note", definition: "An Insights article written from cited product commits. It records past engineering or governance work and makes no claim that a capability is available.", historicalClaimOnly: false },
  { term: "Commit ledger", definition: "The committed list of the product commits this site cites, each checked to be in the product history behind the current manifest pin. A citation that is not in it fails the build.", historicalClaimOnly: false },
  {
    term: "From Drive to Story (FDTS)",
    definition:
      "The internal engineering program name (WAVE-001 through WAVE-011, June–September 2026) under which most of ShortsOS's content-inventory, retrieval, and production-orchestration engineering was built, before the separate \"Commit-to-Content\" governance train that produced this site's own manifest sync. Historical program name only — not a current product or feature.",
    historicalClaimOnly: true,
  },
  {
    term: "Wave (governance)",
    definition:
      "A governance-admitted batch of one or more missions in ShortsOS's internal build process, opened (\"admitted\") and later closed as a unit — e.g. WAVE-006 through WAVE-011. An internal process artifact, not anything a visitor interacts with.",
    historicalClaimOnly: true,
  },
  {
    term: "Sprint 0",
    definition:
      "The name of the product repository's first commit (June 21, 2026): canonical docs, architecture decision records, and an initial roadmap, months before any of the capabilities described elsewhere on this site existed. Historical marker only.",
    historicalClaimOnly: true,
  },
  {
    term: "Commit-to-Content train",
    definition:
      "The internal name for the four-mission governance sequence — SOS-PUBLIC-TRUTH-V1, SOS-CONTENT-IMPACT-V1, SOS-PUBLIC-TRUTH-POLICY-V1, and SOS-PUBLICATION-DECISION-M1-V1 — that produced the ratified manifest this site is synced to, plus the two site-build missions that turned that manifest into this public site.",
    historicalClaimOnly: true,
  },
  {
    term: "merged_dormant (capability lifecycle)",
    definition:
      "One of four internal engineering states a real provider integration passes through before it is allowed to run against a live external account: implemented → tested_locally → merged_dormant → activated. Describes internal engineering maturity only; it is a distinct axis from this site's public/candidate/internal/blocked claim status, and no page infers a public claim from it.",
    historicalClaimOnly: true,
  },
];

export const INSIGHTS_INTRO =
  "Two kinds of article live here. Engineering notes are written from ShortsOS product commits: they " +
  "record what was built or repaired, and when — history, not a feature list. Answers take a buyer " +
  "question this site did not yet answer in depth, and answer it only with wording the ShortsOS owner " +
  "has ratified for public use.";

export const INSIGHTS_NOTE_NOTICE =
  "Historical record, not an availability claim. This note describes engineering work, cited below by " +
  "commit. What may be claimed about each capability it mentions is listed at the end of the page.";

export const INSIGHTS_PROVENANCE: Record<"commit_to_content" | "site_intelligence", string> = {
  commit_to_content:
    "Written from the product commits listed above. Every sentence was declared against a quoted " +
    "source — a commit message or a ratified record — and the article was checked for unsupported, " +
    "overstated or undeclared statements before it was added to this site.",
  site_intelligence:
    "Chosen because a structural read of this site found no page that answered this question in depth. " +
    "Every factual sentence rests on wording the ShortsOS owner ratified for public use, and the article " +
    "was checked for unsupported, overstated or undeclared statements before it was added to this site.",
};

export const INSIGHTS_NEXT_STEP_LABEL = "Read next";

export const INSIGHTS_AUTHORSHIP: Record<"pending" | "done", string> = {
  pending: "Drafted by an AI agent working for the ShortsOS team. Human editorial review of this article is pending.",
  done: "Drafted by an AI agent working for the ShortsOS team, then reviewed by a member of the team.",
};

export const REQUEST_PILOT_COPY = {
  intro:
    "There is no independent signup. Requesting a pilot starts a direct conversation with the " +
    "ShortsOS team about a real engagement.",
  mechanism:
    "This form composes an email in your own email client (a mailto: link) — nothing is submitted " +
    "to a ShortsOS server or database from this page. If your device doesn't open a mail client " +
    "automatically, send the same details directly to the address below.",
};

export const HOME_PAGE_COPY: CopySource = {
  id: "home-page",
  text: [HOME_INTRO, ...PIPELINE_NARRATIVE.map((s) => `${s.title}: ${s.body}`)].join("\n"),
  relatedEntityIds: [M1_ENTITY_ID],
};

export const HOW_IT_WORKS_COPY: CopySource = {
  id: "how-it-works-page",
  text: [HOW_IT_WORKS_INTRO, ...PIPELINE_NARRATIVE.map((s) => `${s.title}: ${s.body}`)].join("\n"),
  relatedEntityIds: [M1_ENTITY_ID],
};

export const METHODOLOGY_COPY: CopySource = {
  id: "methodology-page",
  text: [
    METHODOLOGY_INTRO,
    METHODOLOGY_STATUS_NOTE,
    ...METHODOLOGY_STAGES.map((s) => `${s.name}: ${s.note}`),
  ].join("\n"),
  relatedEntityIds: [],
};

export const PROOF_COPY: CopySource = {
  id: "proof-page",
  text: [PROOF_INTRO, PROOF_WHAT_HAPPENED, PROOF_WHAT_THIS_IS_NOT].join("\n"),
  relatedEntityIds: [M1_ENTITY_ID],
};

export const FAQ_COPY: CopySource = {
  id: "faq-page",
  text: FAQ_ITEMS.map((item) => `${item.q}\n${item.a}`).join("\n"),
  relatedEntityIds: [M1_ENTITY_ID],
};

export const CHANGELOG_COPY: CopySource = {
  id: "changelog-page",
  text: [CHANGELOG_INTRO, ...CHANGELOG_ENTRIES.map((e) => `${e.title}: ${e.body}`)].join("\n"),
  relatedEntityIds: [],
};

export const GLOSSARY_COPY: CopySource = {
  id: "glossary-page",
  text: GLOSSARY_ENTRIES.map((e) => `${e.term}: ${e.definition}`).join("\n"),
  relatedEntityIds: [],
};

export const INSIGHTS_COPY: CopySource = {
  id: "insights-pages",
  text: [
    INSIGHTS_INTRO,
    INSIGHTS_NOTE_NOTICE,
    INSIGHTS_PROVENANCE.commit_to_content,
    INSIGHTS_PROVENANCE.site_intelligence,
    INSIGHTS_AUTHORSHIP.pending,
    INSIGHTS_AUTHORSHIP.done,
    INSIGHTS_NEXT_STEP_LABEL,
  ].join("\n"),
  relatedEntityIds: [],
};

export const REQUEST_PILOT_PAGE_COPY: CopySource = {
  id: "request-pilot-page",
  text: [REQUEST_PILOT_COPY.intro, REQUEST_PILOT_COPY.mechanism].join("\n"),
  relatedEntityIds: [],
};

export const SITE_COPY_SOURCES: CopySource[] = [
  HOME_PAGE_COPY,
  HOW_IT_WORKS_COPY,
  METHODOLOGY_COPY,
  PROOF_COPY,
  FAQ_COPY,
  CHANGELOG_COPY,
  GLOSSARY_COPY,
  REQUEST_PILOT_PAGE_COPY,
  INSIGHTS_COPY,
];
