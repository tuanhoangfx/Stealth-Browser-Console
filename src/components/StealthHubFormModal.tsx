import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HubToolDetailModal } from "@tool-workspace/hub-ui";

export function StealthHubFormModal({
  title,
  headerIcon,
  headerIconClassName = "text-indigo-200",
  onClose,
  footer,
  toc,
  sectionIds,
  children,
  shellClassName = "hub-header-panel-modal",
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
  const hasToc = Boolean(toc);
  return (
    <HubToolDetailModal
      open
      onClose={onClose}
      title={title}
      headerIcon={headerIcon}
      headerIconClassName={headerIconClassName}
      toc={toc}
      sectionIds={sectionIds}
      size={hasToc ? "detail" : "compact"}
      shellClassName={shellClassName}
      footer={footer}
    >
      {children}
    </HubToolDetailModal>
  );
}
