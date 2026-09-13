/**
 * Maps a raw change-impact record file (as read from the product repo's
 * `changes/content-impact/records/*.json`, produced by SOS-CONTENT-IMPACT-V1) onto this
 * repo's own `ChangeImpactRecordRef` shape. The product repo's record carries extra fields
 * (`reason`, `governedPathsTouched`) that are audit context for its own governance process,
 * not this site's concern — this mapper picks exactly the six fields the bundle schema
 * declares and validates their shape, rather than trusting/forwarding the rest.
 */
import type { ChangeImpactRecordRef } from "./schema";

export class ImpactRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpactRecordError";
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function toImpactRecordRef(raw: unknown, sourceLabel: string): ChangeImpactRecordRef {
  if (typeof raw !== "object" || raw === null) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} is not a JSON object.`);
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.changeId !== "string" || r.changeId.length === 0) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} has no string "changeId".`);
  }
  if (typeof r.baseRef !== "string" || r.baseRef.length === 0) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} (${r.changeId}) has no string "baseRef".`);
  }
  if (typeof r.headRef !== "string" || r.headRef.length === 0) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} (${r.changeId}) has no string "headRef".`);
  }
  if (!isStringArray(r.entities)) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} (${r.changeId}) has no string[] "entities".`);
  }
  if (typeof r.qualification !== "string" || r.qualification.length === 0) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} (${r.changeId}) has no string "qualification".`);
  }
  if (!isStringArray(r.surfacesImpacted)) {
    throw new ImpactRecordError(`Change-impact record ${sourceLabel} (${r.changeId}) has no string[] "surfacesImpacted".`);
  }

  return {
    changeId: r.changeId,
    baseRef: r.baseRef,
    headRef: r.headRef,
    entities: r.entities,
    qualification: r.qualification,
    surfacesImpacted: r.surfacesImpacted,
  };
}
