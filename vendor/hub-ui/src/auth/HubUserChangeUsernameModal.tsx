import { useEffect, useMemo, useState } from "react";
import { Save, UserRound } from "lucide-react";
import { HUB_NO_SPELLCHECK_PROPS } from "../lib/no-spellcheck";
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
  HUB_CHANGE_USERNAME_TOC,
  hubUserChangeSectionIcon,
  hubUserChangeTocItems,
} from "./hub-user-change-toc";

export type HubUserChangeUsernameModalProps = {
  open: boolean;
  onClose: () => void;
  initialUsername: string;
  onSubmit: (username: string) => Promise<HubFullUserAccountResult>;
};

/** Sub-modal — update User ID / username (Header · TOC · Main · Footer). */
export function HubUserChangeUsernameModal({
  open,
  onClose,
  initialUsername,
  onSubmit,
}: HubUserChangeUsernameModalProps) {
  const [username, setUsername] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tocItems = useMemo(() => hubUserChangeTocItems(HUB_CHANGE_USERNAME_TOC), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

  useEffect(() => {
    if (!open) return;
    setUsername(initialUsername);
    setMessage(null);
    setBusy(false);
  }, [open, initialUsername]);

  const handleSubmit = () => {
    void (async () => {
      setBusy(true);
      setMessage(null);
      const result = await onSubmit(username.trim().toLowerCase());
      setBusy(false);
      setMessage(result.message);
      if (result.ok) onClose();
    })();
  };

  return (
    <HubToolDetailModal
      open={open}
      onClose={onClose}
      title="Change username"
      titleId="hub-user-change-username-title"
      headerIcon={UserRound}
      headerIconClassName="text-violet-300"
      shellClassName="hub-header-panel-modal"
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      ariaLabelledBy="hub-user-change-username-title"
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      footer={
        <HubToolDetailModalPrimaryAction
          label={busy ? "Saving…" : "Update username"}
          onClick={handleSubmit}
          disabled={busy || !username.trim() || username.trim().toLowerCase() === initialUsername.toLowerCase()}
          busy={busy}
          icon={Save}
        />
      }
    >
      <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
        <HubToolDetailSection
          id="hub-change-username-id"
          title="User ID"
          icon={hubUserChangeSectionIcon(HUB_CHANGE_USERNAME_TOC, "hub-change-username-id")}
        >
          <HubUserModalFieldTable>
            <HubUserModalFieldRow icon={UserRound} iconClassName="text-violet-300" label="Username">
              <input
                className="field w-full text-xs"
                type="text"
                placeholder="3–32 letters, numbers, . _ -"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                {...HUB_NO_SPELLCHECK_PROPS}
              />
            </HubUserModalFieldRow>
          </HubUserModalFieldTable>
          {message ? <p className="auth-gate-message mt-3 text-xs">{message}</p> : null}
        </HubToolDetailSection>
      </div>
    </HubToolDetailModal>
  );
}
