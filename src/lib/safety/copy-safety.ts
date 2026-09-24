/**
 * Copy-safety check (defense in depth, not the source of truth). The product repo's
 * publication-policy.ts is what actually derives whether a capability may be marketed —
 * this is a static-analysis net over THIS site's own copy, catching the case where a page
 * author writes self-serve wording for a capability the manifest still marks
 * `operator_only`. It never overrides the manifest; it only flags a mismatch for a human/CI
 * to fix.
 */
import type { CapabilityManifest } from "../manifest/schema";

/**
 * Phrases that imply an end user can act on a capability themselves — forbidden wherever
 * the backing capability's `availability` is `operator_only`. Deliberately case-insensitive
 * substring matches: a lint should be noisy/over-inclusive rather than miss a real
 * violation through a phrasing variant.
 */
export const FORBIDDEN_SELF_SERVE_PHRASES: string[] = [
  "sign up and start",
  "connect your own",
  "connect your drive",
  "publish it yourself",
  "do it yourself",
  "self-serve",
  "self serve",
  "no operator needed",
  "fully automated for you",
  "start for free",
  "create your account",
  "log in to publish",
  // "self-serve" is not a substring of "self-service".
  "self-service",
  "self service",
];

/**
 * The same guard for French copy (the site is going bilingual). Matching ignores case, accents,
 * apostrophe and dash variants and non-breaking spaces (see `normalizeForPhraseMatch`), so
 * "Créez votre compte" and "creez votre compte" are one phrase. Like the English list, it holds
 * affirmative wording: an honest "no" ("il n'y a pas d'inscription") must stay sayable.
 */
export const FORBIDDEN_SELF_SERVE_PHRASES_FR: string[] = [
  "inscrivez-vous",
  "inscris-toi",
  "créez votre compte",
  "créez un compte",
  "créer votre compte",
  "connectez votre drive",
  "connectez votre compte",
  "connectez vos comptes",
  "connectez votre propre",
  "connectez vos propres",
  "connectez-vous pour publier",
  "publiez vous-même",
  "publiez-le vous-même",
  "publiez directement",
  "faites-le vous-même",
  "libre-service",
  "en autonomie",
  "en toute autonomie",
  "sans opérateur",
  "entièrement automatisé",
  "commencez gratuitement",
  "démarrez gratuitement",
  "essai gratuit",
  "essayez gratuitement",
];

/**
 * Folds the variations a phrase lint must not depend on: case, accents, typographic
 * apostrophes, hyphens and dashes (read as spaces), and runs of spaces, including the
 * non-breaking ones French typography puts before punctuation. Newlines are kept, one for one.
 */
export function normalizeForPhraseMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[-\u2010-\u2015\u2212]/g, " ")
    .replace(/[^\S\n]+/g, " ");
}

const PHRASE_KEYS: { phrase: string; key: string }[] = [];
for (const phrase of [...FORBIDDEN_SELF_SERVE_PHRASES, ...FORBIDDEN_SELF_SERVE_PHRASES_FR]) {
  const key = normalizeForPhraseMatch(phrase);
  if (!PHRASE_KEYS.some((k) => k.key === key)) PHRASE_KEYS.push({ phrase, key });
}

/** Every forbidden phrase (English or French) the text contains, with the line of its first occurrence. */
export function findForbiddenSelfServePhrases(text: string): { phrase: string; line: number }[] {
  const normalized = normalizeForPhraseMatch(text);
  const hits: { phrase: string; line: number }[] = [];
  for (const { phrase, key } of PHRASE_KEYS) {
    const idx = normalized.indexOf(key);
    if (idx !== -1) {
      hits.push({ phrase, line: normalized.slice(0, idx).split("\n").length - 1 });
    }
  }
  return hits;
}

export interface CopySafetyViolation {
  sourceId: string;
  phrase: string;
  /** The line of text the phrase was found in, for a human to locate it quickly. */
  context: string;
}

export interface CopySource {
  /** A stable identifier for error messages (e.g. a file path or route name). */
  id: string;
  text: string;
  /** Manifest entity id(s) this copy is making a claim about/for, if any. */
  relatedEntityIds?: string[];
}

/**
 * Scans copy sources for forbidden self-serve phrasing. A violation is only reported when
 * the copy is NOT globally exempt — i.e. either it names no related entity (any copy could
 * still describe a real self-serve product; we flag it anyway since there is no entity to
 * clear it against) or at least one related entity's `availability` is `operator_only`.
 * A copy source naming ONLY entities that are NOT operator_only is not flagged: those
 * capabilities may legitimately be self-serve.
 */
export function checkCopySafety(sources: CopySource[], manifest: CapabilityManifest): CopySafetyViolation[] {
  const violations: CopySafetyViolation[] = [];

  for (const source of sources) {
    const relatedEntities = (source.relatedEntityIds ?? [])
      .map((id) => manifest.entities.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    const hasNamedEntities = (source.relatedEntityIds ?? []).length > 0;
    const anyOperatorOnly = relatedEntities.some((e) => e.availability === "operator_only");
    const allNamedEntitiesResolvedAndNoneOperatorOnly =
      hasNamedEntities && relatedEntities.length === source.relatedEntityIds!.length && !anyOperatorOnly;

    if (allNamedEntitiesResolvedAndNoneOperatorOnly) {
      continue;
    }

    const lines = source.text.split("\n");
    for (const { phrase, line } of findForbiddenSelfServePhrases(source.text)) {
      violations.push({ sourceId: source.id, phrase, context: (lines[line] ?? "").trim() });
    }
  }

  return violations;
}
