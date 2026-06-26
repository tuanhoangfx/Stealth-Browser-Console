import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { resolveHubBrandIcon } from "../lib/resolve-hub-brand-icon";
import { compactIconSize } from "../ui-scale";
import type { HubBrandIconShell } from "./filter-dropdown-primitives";

export type HubDirectoryIconCellProps = {
  icon?: LucideIcon;
  brandId?: HubBrandIconId;
  imageSrc?: string;
  imageShell?: HubBrandIconShell;
  imageAlt?: string;
  label: string;
  iconClassName?: string;
  title?: string;
};

/** Directory table imgs — plain contain; no filter-dropdown tile/circle chrome. */
function directoryBrandImgClass(shell: HubBrandIconShell): string {
  if (shell === "tile") return "hub-directory-icon-cell__img hub-directory-brand-icon--tile";
  return "hub-directory-icon-cell__img";
}

function DirectoryBrandImg({
  src,
  shell,
  alt,
  fallbackIcon: Fallback,
}: {
  src: string;
  shell: HubBrandIconShell;
  alt: string;
  fallbackIcon?: LucideIcon;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return Fallback ? <Fallback size={compactIconSize(14)} strokeWidth={2.25} /> : null;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={directoryBrandImgClass(shell)}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** Directory table icon + label — platform/proxy/status parity (Scripts platform cell SSOT). */
export function HubDirectoryIconCell({
  icon: Icon,
  brandId,
  imageSrc,
  imageShell = "bare",
  imageAlt = "",
  label,
  iconClassName = "text-indigo-300",
  title,
}: HubDirectoryIconCellProps) {
  const brand = brandId ? resolveHubBrandIcon(brandId) : null;
  const resolvedSrc = brand?.src ?? imageSrc;
  const resolvedShell = brand?.shell ?? imageShell;

  return (
    <span className="hub-directory-icon-cell" title={title ?? label}>
      <span className={`hub-directory-icon-cell__icon ${iconClassName}`} aria-hidden>
        {resolvedSrc ? (
          <DirectoryBrandImg
            src={resolvedSrc}
            shell={resolvedShell}
            alt={imageAlt}
            fallbackIcon={Icon}
          />
        ) : Icon ? (
          <Icon size={compactIconSize(14)} strokeWidth={2.25} />
        ) : null}
      </span>
      <span className="hub-directory-icon-cell__label">{label}</span>
    </span>
  );
}
