/** Vanilla Hub user zoom — parity packages/hub-ui/src/hub-user-zoom.ts (default 90%). */

export const HUB_USER_ZOOM_STEPS = [90, 100, 110, 120];
export const HUB_USER_ZOOM_DEFAULT = 90;
const STORAGE_KEY = "tool-workspace:user-zoom-pct";

function snapToStep(value) {
  let best = HUB_USER_ZOOM_DEFAULT;
  let bestDist = Infinity;
  for (const step of HUB_USER_ZOOM_STEPS) {
    const d = Math.abs(Number(value) - step);
    if (d < bestDist) {
      best = step;
      bestDist = d;
    }
  }
  return best;
}

export function readHubUserZoomPct() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : HUB_USER_ZOOM_DEFAULT;
    return Number.isFinite(n) ? snapToStep(n) : HUB_USER_ZOOM_DEFAULT;
  } catch {
    return HUB_USER_ZOOM_DEFAULT;
  }
}

export function applyHubUserZoomPct(pct) {
  const snapped = snapToStep(pct);
  document.documentElement.style.setProperty("--hub-user-zoom-pct", String(snapped));
  try {
    localStorage.setItem(STORAGE_KEY, String(snapped));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("hub-user-zoom-change", { detail: { pct: snapped } }));
  return snapped;
}

export function hubUserZoomStepIndex(pct) {
  const i = HUB_USER_ZOOM_STEPS.indexOf(snapToStep(pct));
  return i >= 0 ? i : 0;
}

export function initHubUserZoom() {
  applyHubUserZoomPct(readHubUserZoomPct());
}
