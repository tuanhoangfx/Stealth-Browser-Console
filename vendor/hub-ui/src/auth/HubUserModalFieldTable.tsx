import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export type HubUserModalFieldRowProps = {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  children: ReactNode;
};

/** Icon + label column · value column — Cookie extension download FAB pattern. */
export function HubUserModalFieldRow({
  icon: Icon,
  iconClassName = "text-indigo-300",
  label,
  children,
}: HubUserModalFieldRowProps) {
  return (
    <tr className="border-t border-white/5 first:border-0 transition-colors hover:bg-white/[.02]">
      <th className="w-28 py-2 pr-3 text-left text-xs font-medium text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Icon size={compactIconSize(11)} className={iconClassName} aria-hidden />
          {label}
        </span>
      </th>
      <td className="py-2 text-xs text-[var(--text)]">{children}</td>
    </tr>
  );
}

export function HubUserModalFieldTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>{children}</tbody>
    </table>
  );
}
