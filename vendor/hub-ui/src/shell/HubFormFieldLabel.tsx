import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export type HubFormFieldLabelProps = {
  icon?: LucideIcon;
  iconClassName?: string;
  /** Emoji glyph — matches filter trigger icons in task modal (📁, 🗓️, etc.). */
  emoji?: string;
  children: ReactNode;
  className?: string;
};

/** Icon + label row above modal form controls — golden detail modal fields. */
export function HubFormFieldLabel({
  icon: Icon,
  iconClassName = "hub-form-field-label__icon",
  emoji,
  children,
  className = "",
}: HubFormFieldLabelProps) {
  return (
    <span className={`hub-form-field-label${className ? ` ${className}` : ""}`}>
      {emoji ? (
        <span className="hub-form-field-label__emoji" aria-hidden>
          {emoji}
        </span>
      ) : Icon ? (
        <Icon size={compactIconSize(12)} className={iconClassName} aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
