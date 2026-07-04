import { useState } from "react";
import { compactIconSize } from "../ui-scale";
import { resolveHubBrandIcon, type HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { HubBrandIcon } from "./HubBrandIcon";
import type { HubBrandIconShell } from "./filter-dropdown-primitives";
import type { HubGlyphComponent } from "../types/filter-badge";

/** P0020 Services table — brand glyph in name column (16px). */
export const HUB_DIRECTORY_TABLE_BRAND_ICON_PX = 16;

export type HubDirectoryBrandNameCellProps = {
  label: string;
  brandId?: HubBrandIconId;
  imageSrc?: string;
  imageShell?: HubBrandIconShell;
  fallbackIcon?: HubGlyphComponent;
  title?: string;
};

function DirectoryBrandImg({
  src,
  shell,
  alt,
  px,
  fallbackIcon: Fallback,
}: {
  src: string;
  shell: HubBrandIconShell;
  alt: string;
  px: number;
  fallbackIcon?: HubGlyphComponent;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return Fallback ? <Fallback size={px} strokeWidth={2.25} aria-hidden /> : null;
  }
  const tile = shell === "tile" || shell === "darkInk";
  return (
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      className={
        tile
          ? `hub-chrome-brand-icon hub-chrome-brand-icon--${shell === "darkInk" ? "dark-ink" : "tile"}`
          : "hub-chrome-brand-icon-bare"
      }
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** Directory table brand + name — P0020 Services / Accounts parity (`hub-users-cell-name`). */
export function HubDirectoryBrandNameCell({
  label,
  brandId,
  imageSrc,
  imageShell = "bare",
  fallbackIcon: Fallback,
  title,
}: HubDirectoryBrandNameCellProps) {
  const brand = brandId ? resolveHubBrandIcon(brandId) : null;
  const resolvedSrc = brand?.src ?? imageSrc;
  const resolvedShell = brand?.shell ?? imageShell;
  const px = compactIconSize(HUB_DIRECTORY_TABLE_BRAND_ICON_PX);
  const tip = title ?? label;

  return (
    <span className="hub-users-cell-name" title={tip}>
      {brandId && brand ? (
        <HubBrandIcon brandId={brandId} size={HUB_DIRECTORY_TABLE_BRAND_ICON_PX} context="chrome" title={tip} />
      ) : resolvedSrc ? (
        <DirectoryBrandImg src={resolvedSrc} shell={resolvedShell} alt="" px={px} fallbackIcon={Fallback} />
      ) : Fallback ? (
        <Fallback size={px} strokeWidth={2.25} aria-hidden />
      ) : null}
      <span className="hub-users-name-title truncate">{label}</span>
    </span>
  );
}
