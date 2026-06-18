import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export type HubFormFieldLabelProps = {
  icon?: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
  className?: string;
};

/** Icon + label row above modal form controls — golden detail modal fields. */
export function HubFormFieldLabel({
  icon: Icon,
  iconClassName = "hub-form-field-label__icon",
  children,
  className = "",
}: HubFormFieldLabelProps) {
  return (
    <span className={`hub-form-field-label${className ? ` ${className}` : ""}`}>
      {Icon ? <Icon size={compactIconSize(12)} className={iconClassName} aria-hidden /> : null}
      {children}
    </span>
  );
}
