import { useState } from "react";
import { compactIconSize, HUB_CHROME_ICON_PX } from "../ui-scale";
import { resolveHubBrandIcon, type HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { hubBrandIconImgClass, type HubBrandIconShell } from "./filter-dropdown-primitives";

export type HubBrandIconProps = {
  brandId: HubBrandIconId;
  size?: number;
  className?: string;
  /** `chrome` — sidebar/tab header (14px). `filter` — dropdown rows (14px + filter classes). */
  context?: "chrome" | "filter";
  title?: string;
};

function chromeImgClass(shell: HubBrandIconShell): string {
  if (shell === "bare") return "hub-chrome-brand-icon-bare";
  if (shell === "darkInk") return "hub-chrome-brand-icon hub-chrome-brand-icon--dark-ink";
  return "hub-chrome-brand-icon hub-chrome-brand-icon--tile";
}

/** Shared brand logo — SSOT for Zalo, Facebook, and future platform marks. */
export function HubBrandIcon({
  brandId,
  size = HUB_CHROME_ICON_PX,
  className = "",
  context = "chrome",
  title,
}: HubBrandIconProps) {
  const hit = resolveHubBrandIcon(brandId);
  const [imgFailed, setImgFailed] = useState(false);
  const px = compactIconSize(size);

  if (!hit || imgFailed) return null;

  const imgClass =
    context === "filter" ? hubBrandIconImgClass(hit.shell) : chromeImgClass(hit.shell);

  return (
    <img
      src={hit.src}
      alt=""
      width={px}
      height={px}
      title={title ?? hit.label}
      className={`shrink-0 object-contain${className ? ` ${className}` : ""} ${imgClass}`}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
    />
  );
}
