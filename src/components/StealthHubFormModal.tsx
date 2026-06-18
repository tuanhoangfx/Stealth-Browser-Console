import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HubToolDetailModal } from "@tool-workspace/hub-ui";

/** Hub-UI tool form modal — golden shell; pass `shellStyle` only for exceptional wide forms. */
export const STEALTH_HUB_MODAL_WIDTH = "42rem";
export const STEALTH_HUB_MODAL_MAX_HEIGHT = "min(80vh, 42rem)";

export const STEALTH_HUB_MODAL_SHELL_STYLE: CSSProperties = {
  ["--hub-modal-max-w" as string]: STEALTH_HUB_MODAL_WIDTH,
  ["--hub-modal-max-h" as string]: STEALTH_HUB_MODAL_MAX_HEIGHT,
};

export function StealthHubFormModal({
  title,
  headerIcon,
  headerIconClassName = "text-indigo-200",
  onClose,
  footer,
  toc,
  sectionIds,
  children,
  shellClassName = "hub-header-panel-modal"
}: {
  title: string;
  headerIcon?: LucideIcon;
  headerIconClassName?: string;
  onClose: () => void;
  footer?: ReactNode;
  toc?: ReactNode;
  sectionIds?: string[];
  children: ReactNode;
  shellClassName?: string;
}) {
  return (
    <HubToolDetailModal
      open
      onClose={onClose}
      title={title}
      headerIcon={headerIcon}
      headerIconClassName={headerIconClassName}
      toc={toc}
      sectionIds={sectionIds}
      shellClassName={`${shellClassName} hub-tool-detail-modal--fit`}
      footer={footer}
    >
      {children}
    </HubToolDetailModal>
  );
}
