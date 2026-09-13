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
];

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

    const lowerText = source.text.toLowerCase();
    for (const phrase of FORBIDDEN_SELF_SERVE_PHRASES) {
      const idx = lowerText.indexOf(phrase.toLowerCase());
      if (idx !== -1) {
        const lineStart = source.text.lastIndexOf("\n", idx) + 1;
        const lineEndIdx = source.text.indexOf("\n", idx);
        const lineEnd = lineEndIdx === -1 ? source.text.length : lineEndIdx;
        violations.push({
          sourceId: source.id,
          phrase,
          context: source.text.slice(lineStart, lineEnd).trim(),
        });
      }
    }
  }

  return violations;
}
