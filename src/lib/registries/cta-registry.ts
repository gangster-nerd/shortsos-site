/**
 * CTA registry. Every call-to-action the site could ever show is declared here, typed and
 * inert by default. V1 has exactly one ACTIVE entry: `request_pilot`. The others exist in
 * code so a future manifest-driven flip doesn't require inventing new plumbing under time
 * pressure, but they are `enabled: false` and MUST NOT be flipped by a copy change alone —
 * only by a manifest signal (see `requiredManifestSignal` + `isCtaActivatable`).
 */
import { pilotRequestCapability, type PilotRequestCapability } from "../config/pilot-request-config";
import type { CapabilityManifest } from "../manifest/schema";

export type CtaId = "request_pilot" | "connect_your_drive" | "publish_to_instagram" | "start_self_serve";

export interface CtaDefinition {
  id: CtaId;
  label: string;
  href: string;
  /** Hard switch. Only `request_pilot` is true in V1. */
  enabled: boolean;
  /**
   * The manifest entity id (and derived publication status) that must be public_marketable
   * before this CTA could ever be considered for activation. Purely descriptive/documentary
   * for a disabled CTA today — `isCtaActivatable` is what actually checks it.
   */
  requiredManifestSignal: {
    entityId: string;
    requiredDerivedPublicationStatus: "public_marketable";
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
    },
  },
};

export const ACTIVE_CTA_IDS: CtaId[] = (Object.values(CTA_REGISTRY) as CtaDefinition[])
  .filter((cta) => cta.enabled)
  .map((cta) => cta.id);

/**
 * Whether a CTA's `enabled` flag is actually justified by the manifest right now. For
 * `request_pilot` (no gate), always true. For every gated CTA, true only if the manifest
 * has an entity matching `requiredManifestSignal` whose `derivedPublicationStatus` equals
 * `requiredDerivedPublicationStatus`. This function does NOT flip `enabled` itself — it
 * exists so a test (and CI) can refuse a disabled CTA that was flipped to `enabled: true`
 * without the manifest actually backing it, catching a "copy-only" activation mistake.
 */
export function isCtaActivatable(cta: CtaDefinition, manifest: CapabilityManifest): boolean {
  if (cta.requiredManifestSignal === null) {
    return true;
  }
  const entity = manifest.entities.find((e) => e.id === cta.requiredManifestSignal!.entityId);
  if (!entity) {
    return false;
  }
  return entity.derivedPublicationStatus === cta.requiredManifestSignal.requiredDerivedPublicationStatus;
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

/**
 * The pilot CTA renders only where its form can actually deliver a request: the registry enables
 * it, and the Formspree capability is configured (fail-closed). `from` names the placement, so a
 * request records which button it came from.
 */
export function requestPilotLink(from: string, capability: PilotRequestCapability = pilotRequestCapability): { href: string; label: string } | null {
  const cta = CTA_REGISTRY.request_pilot;
  if (!cta.enabled || capability.state !== "configured") return null;
  return { href: `${cta.href}/?from=${encodeURIComponent(from)}`, label: cta.label };
}
