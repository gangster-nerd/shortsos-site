/**
 * Capability / claim registry: the manifest-driven view pages actually read from. Pages
 * must never hardcode a capability's claim text, publication status, or availability —
 * they call these accessors and render whatever the manifest currently says.
 */
import type { CapabilityManifest, ManifestEntity, Surface } from "../manifest/schema";

export interface CapabilityView {
  id: string;
  claim: string;
  status: ManifestEntity["derivedPublicationStatus"];
  availability: ManifestEntity["availability"];
  allowedSurfaces: Surface[];
  knownLimits: string[];
}

/** Every entity currently allowed to make ANY public claim (derived status != blocked/internal_only). */
export function listPubliclyClaimableCapabilities(manifest: CapabilityManifest): CapabilityView[] {
  return manifest.entities
    .filter((e) => e.kind === "capability")
    .filter((e) => e.derivedPublicationStatus === "public_marketable" || e.derivedPublicationStatus === "candidate")
    .map(toView);
}

/** Entities allowed to surface on a specific page/surface, filtered further by publication status. */
export function listForSurface(manifest: CapabilityManifest, surface: Surface): CapabilityView[] {
  return manifest.entities
    .filter((e) => e.kind === "capability")
    .filter((e) => e.allowedSurfaces.includes(surface))
    .filter((e) => e.derivedPublicationStatus !== "blocked" && e.derivedPublicationStatus !== "internal_only")
    .map(toView);
}

export function getEntity(manifest: CapabilityManifest, id: string): ManifestEntity | undefined {
  return manifest.entities.find((e) => e.id === id);
}

function toView(entity: ManifestEntity): CapabilityView {
  return {
    id: entity.id,
    claim: entity.claimCeiling,
    status: entity.derivedPublicationStatus,
    availability: entity.availability,
    allowedSurfaces: entity.allowedSurfaces,
    knownLimits: entity.knownLimits,
  };
}
