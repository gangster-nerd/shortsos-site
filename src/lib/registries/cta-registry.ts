/**
 * CTA registry. Every call-to-action the site could ever show is declared here, typed and
 * inert by default. V1 has exactly one ACTIVE entry: `request_pilot`. The others exist in
 * code so a future manifest-driven flip doesn't require inventing new plumbing under time
 * pressure, but they are `enabled: false` and MUST NOT be flipped by a copy change alone —
 * only by a manifest signal (see `requiredManifestSignal` + `isCtaActivatable`).
 */
import type { CapabilityManifest } from "../manifest/schema";

export type CtaId = "request_pilot" | "connect_your_drive" | "publish_to_instagram" | "start_self_serve";

export interface CtaDefinition {
  id: CtaId;
  label: string;
  href: string;
  /** Hard switch. Only `request_pilot` is true in V1. */
  enabled: boolean;
  /**
   * The manifest entity that must back this CTA before it could ever be considered for
   * activation: public_marketable, generally available (`availability: "public"`), and
   * allowed on the `cta` surface. Purely descriptive/documentary for a disabled CTA today —
   * `isCtaActivatable` is what actually checks it.
   */
  requiredManifestSignal: {
    entityId: string;
    requiredDerivedPublicationStatus: "public_marketable";
    /**
     * Mirrors the product's own rule (`entitySatisfiesCtaRequirement` in
     * `src/public-truth/publication-policy.ts`): a self-serve CTA requires real, general
     * public availability, proven separately. An operator_only entity can be
     * public_marketable under a managed-service framing (M1 is), and that is never enough.
     */
    requiredAvailability: "public";
  } | null;
}

export const CTA_REGISTRY: Record<CtaId, CtaDefinition> = {
  request_pilot: {
    id: "request_pilot",
    label: "Request a pilot",
    href: "/request-pilot",
    enabled: true,
    // The one active CTA has no manifest gate: it is an operator-mediated conversation,
    // not a self-serve capability claim, so it carries no capability-activation signal.
    requiredManifestSignal: null,
  },
  connect_your_drive: {
    id: "connect_your_drive",
    label: "Connect your Drive",
    href: "/connect-drive",
    enabled: false,
    requiredManifestSignal: {
      entityId: "DRIVE-CONNECT-SELF-SERVE-V1",
      requiredDerivedPublicationStatus: "public_marketable",
      requiredAvailability: "public",
    },
  },
  publish_to_instagram: {
    id: "publish_to_instagram",
    label: "Publish to Instagram",
    href: "/publish",
    enabled: false,
    requiredManifestSignal: {
      entityId: "INSTAGRAM-SELF-SERVE-PUBLISH-V1",
      requiredDerivedPublicationStatus: "public_marketable",
      requiredAvailability: "public",
    },
  },
  start_self_serve: {
    id: "start_self_serve",
    label: "Start free",
    href: "/start",
    enabled: false,
    requiredManifestSignal: {
      entityId: "SELF-SERVE-ONBOARDING-V1",
      requiredDerivedPublicationStatus: "public_marketable",
      requiredAvailability: "public",
    },
  },
};

export const ACTIVE_CTA_IDS: CtaId[] = (Object.values(CTA_REGISTRY) as CtaDefinition[])
  .filter((cta) => cta.enabled)
  .map((cta) => cta.id);

/**
 * Whether a CTA's `enabled` flag is actually justified by the manifest right now. For
 * `request_pilot` (no gate), always true. For every gated CTA, true only if the manifest
 * has a capability matching `requiredManifestSignal` that is public_marketable, generally
 * available and allowed on the `cta` surface — every condition must hold. This function
 * does NOT flip `enabled` itself — it exists so a test (and CI) can refuse a disabled CTA
 * that was flipped to `enabled: true` without the manifest actually backing it, catching a
 * "copy-only" activation mistake.
 */
export function isCtaActivatable(cta: CtaDefinition, manifest: CapabilityManifest): boolean {
  const signal = cta.requiredManifestSignal;
  if (signal === null) {
    return true;
  }
  const entity = manifest.entities.find((e) => e.id === signal.entityId);
  if (!entity) {
    return false;
  }
  return (
    entity.kind === "capability" &&
    entity.derivedPublicationStatus === signal.requiredDerivedPublicationStatus &&
    entity.availability === signal.requiredAvailability &&
    entity.allowedSurfaces.includes("cta")
  );
}

/**
 * Invariant checker: every `enabled: true` CTA in the registry must currently be
 * activatable against the given manifest. Returns the list of violations (empty = OK).
 */
export function findUnjustifiedActiveCtas(manifest: CapabilityManifest): CtaId[] {
  return (Object.values(CTA_REGISTRY) as CtaDefinition[])
    .filter((cta) => cta.enabled && !isCtaActivatable(cta, manifest))
    .map((cta) => cta.id);
}
