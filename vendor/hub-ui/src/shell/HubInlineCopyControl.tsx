import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import "./hub-inline-copy-control.css";

const COPY_FLASH_MS = 1400;

/** Brief check flash after clipboard copy — shared by inline copy controls (2FA, Sheet). */
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
};

/**
 * Inline copy control — click text to copy; Check 10px appears after last character on success.
 * Golden: P0020 2FA TwofaCopyControl, Sheet grid cells.
 */
export function HubInlineCopyControl({
  value,
  children,
  title = "Copy",
  className = "",
  valueClassName = "",
  onCopied,
}: HubInlineCopyControlProps) {
  const { copied, flash } = useHubCopyFlash();
  const text = String(value ?? "").trim();

  return (
    <button
      type="button"
      className={`hub-inline-copy-control ${className}`.trim()}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          flash();
          onCopied?.();
        });
      }}
    >
      <span className={`hub-inline-copy-control__value ${valueClassName}`.trim()}>
        {children}
        {copied ? <Check size={10} className="hub-inline-copy-control__tick" aria-hidden /> : null}
      </span>
    </button>
  );
}
