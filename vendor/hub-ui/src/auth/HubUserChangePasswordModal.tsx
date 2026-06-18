import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, ShieldCheck, StickyNote } from "lucide-react";
import {
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
} from "../shell/HubToolDetailModal";
import {
  HubToolDetailSection,
  HUB_TOOL_DETAIL_SECTIONS_CLASS,
} from "../shell/HubToolDetailSection";
import { HubTocSectionNav } from "../shell/HubTocSectionNav";
import { HubUserModalFieldRow, HubUserModalFieldTable } from "./HubUserModalFieldTable";
import type { HubFullUserAccountResult } from "./HubFullUserAccountModal";
import {
  HUB_CHANGE_PASSWORD_TOC,
  hubUserChangeSectionIcon,
  hubUserChangeTocItems,
} from "./hub-user-change-toc";

export type HubUserChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
  recoveryEmail: string;
  canRecover: boolean;
  onSendOtp: (email: string) => Promise<HubFullUserAccountResult>;
  onConfirmPassword: (email: string, code: string, password: string) => Promise<HubFullUserAccountResult>;
};

/** Sub-modal — OTP email code + new password (Header · TOC · Main · Footer). */
export function HubUserChangePasswordModal({
  open,
  onClose,
  recoveryEmail,
  canRecover,
  onSendOtp,
  onConfirmPassword,
}: HubUserChangePasswordModalProps) {
  const [email, setEmail] = useState(recoveryEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tocItems = useMemo(() => hubUserChangeTocItems(HUB_CHANGE_PASSWORD_TOC), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

  useEffect(() => {
    if (!open) return;
    setEmail(recoveryEmail);
    setCode("");
    setPassword("");
    setStep("idle");
    setMessage(null);
    setBusy(false);
  }, [open, recoveryEmail]);

  const handlePrimary = () => {
    void (async () => {
      setBusy(true);
      setMessage(null);
      if (step === "idle") {
        const result = await onSendOtp(email.trim().toLowerCase());
        setBusy(false);
        setMessage(result.message);
        if (result.ok) setStep("sent");
        return;
      }
      const result = await onConfirmPassword(email.trim().toLowerCase(), code.trim(), password);
      setBusy(false);
      setMessage(result.message);
      if (result.ok) onClose();
    })();
  };

  const primaryLabel =
    step === "idle"
      ? busy
        ? "Sending…"
        : "Send code"
      : busy
        ? "Saving…"
        : "Set new password";

  return (
    <HubToolDetailModal
      open={open}
      onClose={onClose}
      title="Change password"
      titleId="hub-user-change-password-title"
      headerIcon={KeyRound}
      headerIconClassName="text-amber-300"
      shellClassName="hub-header-panel-modal"
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      ariaLabelledBy="hub-user-change-password-title"
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      footer={
        <HubToolDetailModalPrimaryAction
          label={primaryLabel}
          onClick={handlePrimary}
          disabled={
            busy ||
            (step === "idle" ? !canRecover || !email.trim() : !code.trim() || password.length < 6)
          }
          busy={busy}
        />
      }
    >
      <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
        <HubToolDetailSection
          id="hub-change-password-email"
          title="Email"
          icon={hubUserChangeSectionIcon(HUB_CHANGE_PASSWORD_TOC, "hub-change-password-email")}
        >
          <HubUserModalFieldTable>
            <HubUserModalFieldRow icon={Mail} iconClassName="text-sky-300" label="Linked email">
              <input
                className="field w-full text-xs"
                type="email"
                placeholder="Linked email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={step === "sent" || !canRecover}
                autoComplete="email"
              />
            </HubUserModalFieldRow>
            {!canRecover ? (
              <HubUserModalFieldRow icon={StickyNote} iconClassName="text-amber-300" label="Note">
                <span className="text-amber-100/90">Link an email first, then use it here.</span>
              </HubUserModalFieldRow>
            ) : null}
          </HubUserModalFieldTable>
        </HubToolDetailSection>

        <HubToolDetailSection
          id="hub-change-password-verify"
          title="Verify"
          icon={hubUserChangeSectionIcon(HUB_CHANGE_PASSWORD_TOC, "hub-change-password-verify")}
        >
          <HubUserModalFieldTable>
            {step === "idle" ? (
              <HubUserModalFieldRow icon={StickyNote} iconClassName="text-slate-400" label="Note">
                <span className="text-[var(--muted)]">
                  We email a 6-digit code to your linked address. Click Send code in the footer.
                </span>
              </HubUserModalFieldRow>
            ) : (
              <>
                <HubUserModalFieldRow icon={ShieldCheck} iconClassName="text-emerald-300" label="Code">
                  <input
                    className="field w-full text-xs"
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </HubUserModalFieldRow>
                <HubUserModalFieldRow icon={KeyRound} iconClassName="text-amber-300" label="Password">
                  <input
                    className="field w-full text-xs"
                    type="password"
                    placeholder="New password (min 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </HubUserModalFieldRow>
              </>
            )}
            {message ? (
              <HubUserModalFieldRow icon={StickyNote} iconClassName="text-amber-300" label="Status">
                <span className="text-amber-100">{message}</span>
              </HubUserModalFieldRow>
            ) : null}
          </HubUserModalFieldTable>
        </HubToolDetailSection>
      </div>
    </HubToolDetailModal>
  );
}
