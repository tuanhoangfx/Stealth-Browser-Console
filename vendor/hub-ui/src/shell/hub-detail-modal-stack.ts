import type { CSSProperties } from "react";

/**
 * Stacked Hub detail modals (P0020 Mail-from-Team / P0005 View customer from Order).
 * Parent stays mounted; child opens on a higher layer. Escape closes only the top layer.
 */

let hubDetailModalStackTop = 0;

/** Acquire a stack layer while a portal detail modal is open (1 = root). */
export function acquireHubDetailModalStackLayer(): number {
  hubDetailModalStackTop += 1;
  return hubDetailModalStackTop;
}

/** Release a layer on unmount / close — only shrinks when releasing the current top. */
export function releaseHubDetailModalStackLayer(layer: number): void {
  if (layer <= 0) return;
  if (layer === hubDetailModalStackTop) {
    hubDetailModalStackTop = Math.max(0, hubDetailModalStackTop - 1);
    return;
  }
  if (layer < hubDetailModalStackTop) {
    hubDetailModalStackTop = Math.max(0, layer - 1);
  }
}

export function isTopHubDetailModalStackLayer(layer: number): boolean {
  return layer > 0 && layer === hubDetailModalStackTop;
}

/** CSS variable bump per stack depth above the first open modal. */
export function hubDetailModalStackBackdropStyle(layer: number): CSSProperties {
  if (layer <= 1) return {};
  const base = 1000;
  return { ["--hub-modal-backdrop-z"]: String(base + (layer - 1) * 50) } as CSSProperties;
}

/** Test / reset helper — not for product UI. */
export function resetHubDetailModalStackForTests(): void {
  hubDetailModalStackTop = 0;
}