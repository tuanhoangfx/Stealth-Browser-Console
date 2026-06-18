import { useEffect, useMemo, useState } from "react";
import { Mail, StickyNote } from "lucide-react";
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
  HUB_CHANGE_EMAIL_TOC,
  hubUserChangeSectionIcon,
  hubUserChangeTocItems,
} from "./hub-user-change-toc";

export type HubUserChangeEmailModalProps = {
  open: boolean;
  onClose: () => void;
  initialEmail: string;
  hasLinkedEmail: boolean;
  onSubmit: (email: string) => Promise<HubFullUserAccountResult>;
};

/** Sub-modal — link or update contact email (Header · TOC · Main · Footer). */
export function HubUserChangeEmailModal({
  open,
  onClose,
  initialEmail,
  hasLinkedEmail,
  onSubmit,
}: HubUserChangeEmailModalProps) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tocItems = useMemo(() => hubUserChangeTocItems(HUB_CHANGE_EMAIL_TOC), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const title = hasLinkedEmail ? "Change email" : "Link email";

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail);
    setMessage(null);
    setBusy(false);
  }, [open, initialEmail]);

  const handleSubmit = () => {
    void (async () => {
      setBusy(true);
      setMessage(null);
      const result = await onSubmit(email.trim().toLowerCase());
      setBusy(false);
      setMessage(result.message);
      if (result.ok) onClose();
    })();
  };

  return (
    <HubToolDetailModal
      open={open}
      onClose={onClose}
      title={title}
      titleId="hub-user-change-email-title"
      headerIcon={Mail}
      headerIconClassName="text-sky-300"
      shellClassName="hub-header-panel-modal"
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      ariaLabelledBy="hub-user-change-email-title"
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      footer={
        <HubToolDetailModalPrimaryAction
          label={busy ? "Sending…" : hasLinkedEmail ? "Update email" : "Link email"}
          onClick={handleSubmit}
          disabled={busy || !email.trim()}
          busy={busy}
        />
      }
    >
      <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
        <HubToolDetailSection
          id="hub-change-email-address"
          title="Address"
          icon={hubUserChangeSectionIcon(HUB_CHANGE_EMAIL_TOC, "hub-change-email-address")}
        >
          <HubUserModalFieldTable>
            <HubUserModalFieldRow icon={Mail} iconClassName="text-sky-300" label="New email">
              <input
                className="field w-full text-xs"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </HubUserModalFieldRow>
          </HubUserModalFieldTable>
        </HubToolDetailSection>

        <HubToolDetailSection
          id="hub-change-email-confirm"
          title="Confirmation"
          icon={hubUserChangeSectionIcon(HUB_CHANGE_EMAIL_TOC, "hub-change-email-confirm")}
        >
          <HubUserModalFieldTable>
            <HubUserModalFieldRow icon={StickyNote} iconClassName="text-slate-400" label="Note">
              <span className="text-[var(--muted)]">
                A confirmation link is sent before the new address becomes active.
              </span>
            </HubUserModalFieldRow>
            {message ? (
              <HubUserModalFieldRow icon={Mail} iconClassName="text-indigo-300" label="Status">
                <span className="text-indigo-200">{message}</span>
              </HubUserModalFieldRow>
            ) : null}
          </HubUserModalFieldTable>
        </HubToolDetailSection>
      </div>
    </HubToolDetailModal>
  );
}
