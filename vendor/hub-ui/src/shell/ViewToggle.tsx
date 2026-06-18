import { LayoutGrid, Table2 } from "lucide-react";
import { compactIconSize } from "../ui-scale";

export type HubViewMode = "table" | "card";

export function ViewToggle({ value, onChange }: { value: HubViewMode; onChange: (v: HubViewMode) => void }) {
  return (
    <div className="inline-flex h-[var(--hub-control-h)] items-center rounded-lg border border-white/10 bg-[var(--panel)] p-0.5">
      <Btn active={value === "table"} onClick={() => onChange("table")} icon={<Table2 size={compactIconSize(14)} />} label="Table" />
      <Btn active={value === "card"} onClick={() => onChange("card")} icon={<LayoutGrid size={compactIconSize(14)} />} label="Cards" />
    </div>
  );
}

function Btn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
        active ? "bg-indigo-500/20 text-indigo-200" : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {icon} {label}
    </button>
  );
}
