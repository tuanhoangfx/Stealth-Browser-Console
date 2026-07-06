import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { copyToastLabelFromTitle } from "../toast/copy-toast";
import { useHubToast } from "../toast/HubToastContext";
import type { HubCopyFeedback } from "./HubCopyBadge";
import "./hub-inline-copy-control.css";

const COPY_FLASH_MS = 1400;

/** Brief check flash — legacy inline mode only. */
export function useHubCopyFlash(durationMs = COPY_FLASH_MS) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [copied, durationMs]);
  return { copied, flash: () => setCopied(true) };
}

export type HubInlineCopyControlProps = {
  value: string;
  children: ReactNode;
  title?: string;
  className?: string;
  valueClassName?: string;
  onCopied?: () => void;
  copyFeedback?: HubCopyFeedback;
  copyToastLabel?: string;
};

/**
 * Inline copy control — click text to copy.
 * Default: toast when HubToastProvider mounted (P0020 Sheet grid — no inline ✓).
 */
export function HubInlineCopyControl({
  value,
  children,
  title = "Copy",
  className = "",
  valueClassName = "",
  onCopied,
  copyFeedback = "auto",
  copyToastLabel,
}: HubInlineCopyControlProps) {
  const toast = useHubToast();
  const { copied, flash } = useHubCopyFlash();
  const text = String(value ?? "").trim();

  const useToast =
    copyFeedback === "toast" || (copyFeedback === "auto" && toast != null);
  const useInlineTick = copyFeedback === "inline" || (copyFeedback === "auto" && toast == null);

  return (
    <button
      type="button"
      className={`hub-inline-copy-control ${className}`.trim()}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          if (useToast) {
            toast?.pushCopyToast(text, copyToastLabel ?? copyToastLabelFromTitle(title));
          } else if (useInlineTick) {
            flash();
          }
          onCopied?.();
        });
      }}
    >
      <span className={`hub-inline-copy-control__value ${valueClassName}`.trim()}>
        {children}
        {useInlineTick && copied ? <Check size={10} className="hub-inline-copy-control__tick" aria-hidden /> : null}
      </span>
    </button>
  );
}
