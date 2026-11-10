import { memo, useMemo, useState } from "react";
import { Puzzle } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmPlainRelativeTime,
  HubAdmRecordMetaRow,
  HubToolDetailModal,
  HubToolDetailModalAccountFooter,
  HubToolDetailRail,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI,
  HUB_ADM_TYPE_MONO_CLASS,
} from "@tool-workspace/hub-ui";
import { resolveExtensionDisplayName } from "../../../lib/extension-display-name";
import { COOKIE_BRIDGE_STORE_ID } from "../../../lib/stealth-extension-store-ids";
import type { CachedStoreExtension } from "../../../types";
import { ExtensionDetailCookieBridgePanel } from "./ExtensionDetailCookieBridgePanel";
import { ExtensionDetailHistoryRail } from "./ExtensionDetailHistoryRail";
import { ExtensionDetailInstallPanel } from "./ExtensionDetailInstallPanel";
import { ExtensionDetailLogRail } from "./ExtensionDetailLogRail";
import { ExtensionDetailOperatorPanel } from "./ExtensionDetailOperatorPanel";
import { ExtensionDetailTocNav } from "./ExtensionDetailTocNav";
import { ExtensionKindBadge } from "./extension-kind-badge";
import { extensionDetailTocNavItems } from "./extension-detail-toc-nav";
import {
  EXTENSION_DETAIL_MODAL_SHELL_CLASS,
  EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE,
  EXTENSION_DETAIL_SECTION_INSTALL,
  EXTENSION_DETAIL_SECTION_METADATA,
  EXTENSION_DETAIL_SECTION_OPERATOR,
} from "./extension-detail-toc";

function isCookieBridgeExtension(ext: CachedStoreExtension) {
  return ext.storeId === COOKIE_BRIDGE_STORE_ID || /cookie bridge/i.test(ext.name);
}

function isOperatorExtension(ext: CachedStoreExtension) {
  return ext.localKey === "e0002-browser-operator" || /e0002|browser operator/i.test(ext.name);
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
  onClose: () => void;
}) {
  const [logRailFocused, setLogRailFocused] = useState(false);
  const showCookieBridge = extension ? isCookieBridgeExtension(extension) : false;
  const showOperator = extension ? isOperatorExtension(extension) : false;

  const tocItems = useMemo(
    () =>
      extensionDetailTocNavItems({
        showInstall: installOnly,
        showCookieBridge,
        showOperator,
      }),
    [installOnly, showCookieBridge, showOperator],
  );

  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const title = installOnly
    ? "New extension"
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
        headerCenter={<HubAccountDetailHeaderSearch />}
        shellClassName={EXTENSION_DETAIL_MODAL_SHELL_CLASS}
        sectionIds={sectionIds}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        busy={busy}
        toc={
          <HubToolDetailRail
            title="Navigate"
            titleEmoji={HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ExtensionDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <HubToolDetailModalAccountFooter
            onClose={onClose}
            busy={busy}
            onSave={installOnly ? onInstallStore : undefined}
            saveLabel="Install from Web Store"
            saveIcon={Puzzle}
            saveVariant="create"
            saveDisabled={busy || !storeInput.trim()}
          />
        }
        ariaLabelledBy="extension-detail-title"
      >
        <HubAccountDetailAdmScaffold
          panelId={EXTENSION_DETAIL_SECTION_METADATA}
          panelTitle={installOnly ? "New" : "Metadata"}
          panelTitleEmoji={installOnly ? "🧩" : undefined}
          panelAdmSectionKey={installOnly ? undefined : "record"}
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
                    created={
                      extension.createdAt || extension.updatedAt ? (
                        <HubAdmPlainRelativeTime at={(extension.createdAt ?? extension.updatedAt)!} />
                      ) : (
                        "—"
                      )
                    }
                    updated={
                      extension.updatedAt ? (
                        <HubAdmPlainRelativeTime at={extension.updatedAt} />
                      ) : (
                        "—"
                      )
                    }
                  />
                  <dl className="grid gap-2 rounded-lg border border-white/5 bg-white/[.02] px-3 py-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">Kind</dt>
                      <dd className="font-medium text-[var(--text)]">
                        <ExtensionKindBadge kind={extension.kind} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="font-medium text-[var(--muted)]">Version</dt>
                      <dd className="font-normal tabular-nums text-[var(--text)]">{extension.version || "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-[var(--muted)]">Path</dt>
                      <dd className="mt-0.5 break-all text-xs font-normal text-[var(--muted)]">
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
                  />
                </section>
              ) : null}
              {showCookieBridge ? (
                <section id={EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE} className="scroll-mt-4">
                  <ExtensionDetailCookieBridgePanel jobLabel={jobLabel} />
                </section>
              ) : null}
              {showOperator ? (
                <section id={EXTENSION_DETAIL_SECTION_OPERATOR} className="scroll-mt-4">
                  <ExtensionDetailOperatorPanel jobLabel={jobLabel} />
                </section>
              ) : null}
            </>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              {installOnly ? null : <ExtensionDetailHistoryRail />}
              <ExtensionDetailLogRail focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
});
