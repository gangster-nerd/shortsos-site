/**
 * Visual registry: named, reusable visual "slots" pages can reference by id rather than
 * pages hand-picking an image/diagram path. V1 has no real product screenshots or brand
 * assets to show (this repo has no design/copy deliverable yet — that is SOS-CATCHUP-V1),
 * so every slot below is a placeholder. Kept as a typed registry (not inline strings in
 * JSX) so a future real-asset pass has one place to edit, not a grep across pages.
 */
export type VisualSlotId = "hero" | "how_it_works_diagram" | "proof_screenshot";

export interface VisualSlot {
  id: VisualSlotId;
  /** Alt text — must describe the placeholder honestly, never imply a real screenshot. */
  alt: string;
  /** Relative path under /public, or null if no asset exists yet. */
  src: string | null;
}

export const VISUAL_REGISTRY: Record<VisualSlotId, VisualSlot> = {
  hero: {
    id: "hero",
    alt: "Placeholder — no hero visual has been designed yet.",
    src: null,
  },
  how_it_works_diagram: {
    id: "how_it_works_diagram",
    alt: "Placeholder — no how-it-works diagram has been designed yet.",
    src: null,
  },
  proof_screenshot: {
    id: "proof_screenshot",
    alt: "Placeholder — no proof screenshot has been captured yet.",
    src: null,
  },
};
