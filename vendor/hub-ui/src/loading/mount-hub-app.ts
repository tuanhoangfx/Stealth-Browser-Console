import { hideBootLoader } from "./hub-loader-dom";

export function mountHubApp(rootEl: HTMLElement, render: () => void) {
  try {
    render();
    requestAnimationFrame(() => hideBootLoader());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hideBootLoader();
    rootEl.innerHTML =
      '<div style="max-width:32rem;margin:2rem auto;padding:1.25rem;border-radius:0.75rem;border:1px solid rgba(244,63,94,0.35);background:rgba(244,63,94,0.08);color:#fecdd3;font:13px/1.5 Inter,system-ui,sans-serif">' +
      "<strong>App failed to mount</strong><br/>" +
      message +
      "</div>";
    console.error("[hub-boot]", error);
  }
}
