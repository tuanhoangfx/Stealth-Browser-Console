import { useState } from "react";
import { compactIconSize } from "../ui-scale";
import { resolveHubBrandIcon, type HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { hubDirectoryTableBrandImgClass, type HubBrandIconShell } from "./filter-dropdown-primitives";
import type { HubGlyphComponent } from "../types/filter-badge";

/** P0020 Services table — brand glyph in name column (16px). */
export const HUB_DIRECTORY_TABLE_BRAND_ICON_PX = 16;

export type HubDirectoryBrandNameCellProps = {
  label: string;
  brandId?: HubBrandIconId;
  imageSrc?: string;
  imageShell?: HubBrandIconShell;
  fallbackGlyph?: string;
  fallbackIcon?: HubGlyphComponent;
  /** @deprecated Body cells use no hover tooltip — header hints only. */
  title?: string;
};

function DirectoryBrandGlyph({ px, glyph }: { px: number; glyph: string }) {
  return (
    <span
      className="hub-directory-brand-glyph inline-flex shrink-0 items-center justify-center"
      style={{ width: px, height: px }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

function DirectoryBrandImg({
  src,
  shell,
  alt,
  px,
  fallbackGlyph,
  fallbackIcon: Fallback,
}: {
  src: string;
  shell: HubBrandIconShell;
  alt: string;
  px: number;
  fallbackGlyph?: string;
  fallbackIcon?: HubGlyphComponent;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    if (fallbackGlyph) return <DirectoryBrandGlyph px={px} glyph={fallbackGlyph} />;
    return Fallback ? <Fallback size={px} strokeWidth={2.25} aria-hidden /> : null;
  }
  return (
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      className={hubDirectoryTableBrandImgClass(shell)}
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
  fallbackGlyph,
  fallbackIcon: Fallback,
}: HubDirectoryBrandNameCellProps) {
  const brand = brandId ? resolveHubBrandIcon(brandId) : null;
  const resolvedSrc = brand?.src ?? imageSrc;
  const resolvedShell = brand?.shell ?? imageShell;
  const px = compactIconSize(HUB_DIRECTORY_TABLE_BRAND_ICON_PX);

  return (
    <span className="hub-users-cell-name">
      {brandId && brand ? (
        <DirectoryBrandImg
          src={brand.src}
          shell={brand.shell}
          alt=""
          px={px}
          fallbackGlyph={fallbackGlyph}
          fallbackIcon={Fallback}
        />
      ) : resolvedSrc ? (
        <DirectoryBrandImg
          src={resolvedSrc}
          shell={resolvedShell}
          alt=""
          px={px}
          fallbackGlyph={fallbackGlyph}
          fallbackIcon={Fallback}
        />
      ) : fallbackGlyph ? (
        <DirectoryBrandGlyph px={px} glyph={fallbackGlyph} />
      ) : Fallback ? (
        <Fallback size={px} strokeWidth={2.25} aria-hidden />
      ) : null}
      <span className="hub-users-name-title truncate">{label}</span>
    </span>
  );
}
