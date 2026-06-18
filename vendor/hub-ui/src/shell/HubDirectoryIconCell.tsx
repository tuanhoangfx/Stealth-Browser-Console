import type { LucideIcon } from "lucide-react";

export type HubDirectoryIconCellProps = {
  icon?: LucideIcon;
  imageSrc?: string;
  imageAlt?: string;
  label: string;
  iconClassName?: string;
  title?: string;
};

/** Directory table icon + label — platform/proxy/status parity (Scripts platform cell SSOT). */
export function HubDirectoryIconCell({
  icon: Icon,
  imageSrc,
  imageAlt = "",
  label,
  iconClassName = "text-indigo-300",
  title,
}: HubDirectoryIconCellProps) {
  return (
    <span className="hub-directory-icon-cell" title={title ?? label}>
      <span className={`hub-directory-icon-cell__icon ${iconClassName}`} aria-hidden>
        {imageSrc ? (
          <img src={imageSrc} alt={imageAlt} className="hub-directory-icon-cell__img" />
        ) : Icon ? (
          <Icon size={14} strokeWidth={2.25} />
        ) : null}
      </span>
      <span className="hub-directory-icon-cell__label">{label}</span>
    </span>
  );
}
