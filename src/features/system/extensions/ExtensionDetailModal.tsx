import { memo, useMemo, useState } from "react";
import { Puzzle, X } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmRecordMetaRow,
  HubToolDetailModal,
  HubToolDetailModalSecondaryAction,
  HubToolDetailRail,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ADM_TYPE_MONO_CLASS,
  HUB_DETAIL_MODAL_CLOSE_LABEL,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "@tool-workspace/hub-ui";
import { formatDateTime } from "../../../lib/run-display";
import { resolveExtensionDisplayName } from "../../../lib/extension-display-name";
import { COOKIE_BRIDGE_STORE_ID } from "../../../lib/stealth-extension-store-ids";
import type { CachedStoreExtension } from "../../../types";
import { ExtensionDetailCookieBridgePanel } from "./ExtensionDetailCookieBridgePanel";
import { ExtensionDetailHistoryRail } from "./ExtensionDetailHistoryRail";
import { ExtensionDetailInstallPanel } from "./ExtensionDetailInstallPanel";
import { ExtensionDetailLogRail } from "./ExtensionDetailLogRail";
import { ExtensionDetailTocNav } from "./ExtensionDetailTocNav";
import { extensionDetailTocNavItems } from "./extension-detail-toc-nav";
import {
  EXTENSION_DETAIL_MODAL_SHELL_CLASS,
  EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE,
  EXTENSION_DETAIL_SECTION_INSTALL,
  EXTENSION_DETAIL_SECTION_METADATA,
} from "./extension-detail-toc";

function isCookieBridgeExtension(ext: CachedStoreExtension) {
  return ext.storeId === COOKIE_BRIDGE_STORE_ID || /cookie bridge/i.test(ext.name);
}

/** System → Extensions detail modal — Layout 3 SSOT (TOC | main | History + Console). */
export const ExtensionDetailModal = memo(function ExtensionDetailModal({
  extension,
  installOnly = false,
  jobLabel = null,
  storeInput,
  setStoreInput,
  profileScope,
  setProfileScope,
  profiles,
  profileId,
  setProfileId,
  busy = false,
  onInstallStore,
  onInstallUnpacked,
  onClose,
}: {
  extension?: CachedStoreExtension | null;
  installOnly?: boolean;
  jobLabel?: string | null;
  storeInput: string;
  setStoreInput: (value: string) => void;
  profileScope: "all" | "one";
  setProfileScope: (value: "all" | "one") => void;
  profiles: Array<{ id: string; name: string }>;
  profileId: string;
  setProfileId: (value: string) => void;
  busy?: boolean;
  onInstallStore: () => void;
  onInstallUnpacked: () => void;
  onClose: () => void;
}) {
  const [logRailFocused, setLogRailFocused] = useState(false);
  const showCookieBridge = extension ? isCookieBridgeExtension(extension) : false;

  const tocItems = useMemo(
    () =>
      extensionDetailTocNavItems({
        showInstall: installOnly,
        showCookieBridge,
      }),
    [installOnly, showCookieBridge],
  );

  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const title = installOnly
    ? "Install extension"
    : extension
      ? resolveExtensionDisplayName(extension)
      : "Extension";

  const handleLogFocus = () => {
    setLogRailFocused(true);
    window.setTimeout(() => setLogRailFocused(false), 1200);
  };

  return (
    <HubAccountDetailSearchProvider>
      <HubToolDetailModal
        open
        onClose={onClose}
        title={title}
        titleId="extension-detail-title"
        headerIcon={Puzzle}
        headerIconClassName="text-orange-300"
        headerCenter={extension ? <HubAccountDetailHeaderSearch /> : undefined}
        shellClassName={EXTENSION_DETAIL_MODAL_SHELL_CLASS}
        sectionIds={sectionIds}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        toc={
          <HubToolDetailRail
            title="Navigate"
            icon={hubAccountDetailSectionIcon("navigate")}
            iconClassName={hubAccountDetailSectionIconClass("navigate")}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ExtensionDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <HubToolDetailModalSecondaryAction
            label={HUB_DETAIL_MODAL_CLOSE_LABEL}
            onClick={onClose}
            icon={X}
          />
        }
        ariaLabelledBy="extension-detail-title"
      >
        <HubAccountDetailAdmScaffold
          panelId={EXTENSION_DETAIL_SECTION_METADATA}
          panelTitle={installOnly ? "Install" : "Metadata"}
          panelAdmSectionKey="record"
          frameClassName="twofa-account-detail-modal__frame"
          panelClassName="twofa-account-detail__panel"
          main={
            <>
              {extension && !installOnly ? (
                <>
                  <HubAdmRecordMetaRow
                    vaultId={
                      <span className={`${HUB_ADM_TYPE_MONO_CLASS} break-all font-mono text-[10px]`}>
                        {extension.storeId || extension.localKey || "—"}
                      </span>
                    }
                    created={undefined}
                    updated={
                      extension.updatedAt ? (
                        <time dateTime={extension.updatedAt} title={formatDateTime(extension.updatedAt)}>
                          {formatDateTime(extension.updatedAt)}
                        </time>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <dl className="grid gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">Kind</dt>
                      <dd className="font-medium capitalize text-[var(--text)]">{extension.kind}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">Version</dt>
                      <dd className="font-mono font-medium text-[var(--text)]">{extension.version || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">Path</dt>
                      <dd className="mt-0.5 break-all font-mono text-[10px] text-[var(--muted)]">
                        {extension.unpackedPath}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : null}
              {installOnly ? (
                <section id={EXTENSION_DETAIL_SECTION_INSTALL} className="scroll-mt-4">
                  <ExtensionDetailInstallPanel
                    storeInput={storeInput}
                    setStoreInput={setStoreInput}
                    profileScope={profileScope}
                    setProfileScope={setProfileScope}
                    profiles={profiles}
                    profileId={profileId}
                    setProfileId={setProfileId}
                    busy={busy}
                    onInstallStore={onInstallStore}
                    onInstallUnpacked={onInstallUnpacked}
                  />
                </section>
              ) : null}
              {showCookieBridge ? (
                <section id={EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE} className="scroll-mt-4">
                  <ExtensionDetailCookieBridgePanel jobLabel={jobLabel} />
                </section>
              ) : null}
            </>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <ExtensionDetailHistoryRail />
              <ExtensionDetailLogRail focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
});
