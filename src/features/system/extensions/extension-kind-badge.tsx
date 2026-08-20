import { FolderOpen, Store } from "lucide-react";

const KIND_META = {
  store: { Icon: Store, label: "Store", className: "text-sky-300" },
  local: { Icon: FolderOpen, label: "Local", className: "text-amber-300" },
} as const;

export function ExtensionKindBadge({ kind }: { kind: "store" | "local" }) {
  const meta = KIND_META[kind] ?? KIND_META.local;
  const Icon = meta.Icon;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon size={14} className={`shrink-0 ${meta.className}`} aria-hidden />
      <span className="hub-directory-table-body-text">{meta.label}</span>
    </span>
  );
}
