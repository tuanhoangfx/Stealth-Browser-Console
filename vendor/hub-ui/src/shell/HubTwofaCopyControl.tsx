import { type ReactNode } from "react";
import { Check } from "lucide-react";
import { copyTextWithFallback } from "../lib/copy-text-with-fallback";
import { useHubToast } from "../toast/HubToastContext";
import type { HubCopyFeedback } from "./HubCopyBadge";
import { useHubCopyFlash } from "./HubInlineCopyControl";
import "./hub-directory-copy-control.css";

export type HubTwofaCopyControlProps = {
  value: string;
  display: ReactNode;
  className?: string;
  wrapClassName?: string;
  copyToastLabel?: string;
  onCopied?: () => void;
  copyFeedback?: HubCopyFeedback;
};

/** Directory table copy control — 2FA Account / Password / Secret parity (P0020 golden). No cell tooltip. */
export function HubTwofaCopyControl({
  value,
  display,
  className = "",
  wrapClassName = "",
  copyToastLabel = "Copied",
  onCopied,
  copyFeedback = "auto",
}: HubTwofaCopyControlProps) {
  const toast = useHubToast();
  const { copied, flash } = useHubCopyFlash();
  const text = String(value ?? "").trim();

  const useToast =
    copyFeedback === "toast" || (copyFeedback === "auto" && toast != null);
  const useInlineTick = copyFeedback === "inline" || (copyFeedback === "auto" && toast == null);

  return (
    <button
      type="button"
      className={`hub-directory-copy-wrap twofa-copy-control-wrap ${wrapClassName}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        void copyTextWithFallback(text).finally(() => {
          if (useToast) {
            toast?.pushCopyToast(text, copyToastLabel);
          } else if (useInlineTick) {
            flash();
          }
          onCopied?.();
        });
      }}
    >
      <span className={`hub-directory-copy-control twofa-copy-control ${className}`.trim()}>
        <span className="hub-directory-copy-control__value twofa-copy-control__value min-w-0">{display}</span>
        {useInlineTick && copied ? (
          <Check size={10} className="twofa-copy-control__tick shrink-0 text-emerald-400" aria-hidden />
        ) : null}
      </span>
    </button>
  );
}
