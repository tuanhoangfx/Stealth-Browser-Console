import { useEffect, useState } from "react";
import { Check, Copy, Fingerprint } from "lucide-react";
import { compactIconSize } from "../ui-scale";

export type HubCopyBadgeProps = {
  value: string;
  /** Shown label; defaults to truncated value */
  label?: string;
  title?: string;
  className?: string;
  onCopied?: () => void;
};

/**
 * Hub copy badge — ID / mono value chip (P0004 Users table).
 * Copy icon stays visible; a small check appears beside on success (no label swap).
 */
export function HubCopyBadge({ value, label, title, className = "", onCopied }: HubCopyBadgeProps) {
  const [copied, setCopied] = useState(false);
  const display = label ?? (value.length > 10 ? `${value.slice(0, 8)}…` : value);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void copy(e)}
      title={title ?? `Copy ${value}`}
      className={`inline-flex h-[var(--hub-metric-badge-h)] max-w-full items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 text-[10px] font-mono font-medium leading-none text-[var(--muted)] transition-colors hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-indigo-200 ${className}`}
    >
      <Fingerprint size={compactIconSize(10)} className="shrink-0 text-indigo-300/80" aria-hidden />
      <span className="truncate">{display}</span>
      <Copy size={compactIconSize(10)} className="shrink-0 opacity-60" aria-hidden />
      {copied ? <Check size={compactIconSize(10)} className="shrink-0 text-emerald-400" aria-hidden /> : null}
    </button>
  );
}
