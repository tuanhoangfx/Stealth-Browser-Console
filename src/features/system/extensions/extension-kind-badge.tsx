import { FolderOpen, Store } from "lucide-react";

const KIND_META = {
  store: {
    Icon: Store,
    label: "Store",
    className: "text-sky-300",
    dotClassName: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]",
  },
  local: {
    Icon: FolderOpen,
    label: "Local",
    className: "text-amber-300",
    dotClassName: "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.75)]",
  },
} as const;

export function ExtensionKindBadge({ kind }: { kind: "store" | "local" }) {
  const meta = KIND_META[kind] ?? KIND_META.local;
  const Icon = meta.Icon;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClassName}`}
        aria-hidden
      />
      <Icon size={14} className={`shrink-0 ${meta.className}`} aria-hidden />
      <span className="hub-directory-table-body-text">{meta.label}</span>
    </span>
  );
}
