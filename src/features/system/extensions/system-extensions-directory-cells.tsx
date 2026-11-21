import {
  DirectoryTableBodyCell,
  getDirectorySearchHighlight,
  HubDirectoryCopyText,
  HubDirectoryEmptyCell,
  HubDirectorySearchHighlightText,
  HubDirectoryTimestampLabel,
  HubDirectoryValuePopover,
  HubTwofaCopyControl,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import type { CachedStoreExtension } from "../../../types";
import { resolveExtensionDisplayName } from "../../../lib/extension-display-name";
import type { StealthExtensionsColumnKey } from "../../../lib/directory-column-meta";
import { ExtensionKindBadge } from "./extension-kind-badge";
import { formatSwHealthDetailLabel } from "./extension-sw-health-label";

function renderUpdatedCell(iso?: string) {
  if (!iso) return <HubDirectoryEmptyCell className="hub-directory-table-body-text hub-users-cell-muted" />;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <HubDirectoryEmptyCell className="hub-directory-table-body-text hub-users-cell-muted" />;
  return <HubDirectoryTimestampLabel at={iso} />;
}

function defaultExtensionLog(ext: CachedStoreExtension): string {
  if (ext.activityLog) return ext.activityLog;
  const ver = ext.version ? `v${ext.version}` : "latest";
  if (ext.storeId === "kaaadageakdandpobcofplmfbjfjabdk" || ext.localKey === "e0002-browser-operator") {
    return `🟢 Staged ${ver} · Auto-Pinned`;
  }
  return `📦 Cached ${ver} · Web Store Ready`;
}

export function renderSystemExtensionsDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthExtensionsColumnKey>,
  ext: CachedStoreExtension,
  ctx: { searchQuery?: string },
) {
  const { key, colClass } = col;
  const searchHighlight = getDirectorySearchHighlight(ctx.searchQuery ?? "", { mixedRequiresWhitespace: true });
  const displayName = resolveExtensionDisplayName(ext);
  const nameTerms = [
    ...(searchHighlight?.idTerms ?? []),
    ...(searchHighlight?.textTerms ?? []),
  ];

  switch (key) {
    case "extension":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <div className="flex min-w-0 items-center gap-2">
            {ext.iconDataUri ? (
              <img src={ext.iconDataUri} alt="" className="h-5 w-5 shrink-0 rounded" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cyan-500/20 text-[10px] text-cyan-200">
                Ext
              </span>
            )}
            <HubTwofaCopyControl
              value={displayName}
              copyToastLabel="Extension copied"
              className="twofa-copy-control--account min-w-0 max-w-full"
              wrapClassName="min-w-0 flex-1"
              display={
                <HubDirectorySearchHighlightText
                  text={displayName}
                  terms={nameTerms}
                  className="hub-users-name-title truncate"
                />
              }
            />
          </div>
        </DirectoryTableBodyCell>
      );
    case "kind":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <ExtensionKindBadge kind={ext.kind} />
        </DirectoryTableBodyCell>
      );
    case "version":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {ext.version ? (
            <span className="hub-directory-table-body-text tabular-nums">{ext.version}</span>
          ) : (
            <HubDirectoryEmptyCell className="hub-directory-table-body-text hub-users-cell-muted" />
          )}
        </DirectoryTableBodyCell>
      );
    case "storeId": {
      const storeOrLocalId = ext.storeId || ext.localKey;
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {storeOrLocalId ? (
            <HubDirectoryCopyText
              value={storeOrLocalId}
              copyToastLabel="Store ID copied"
              className="hub-directory-table-body-text hub-users-cell-muted"
            />
          ) : (
            <HubDirectoryEmptyCell className="hub-directory-table-body-text hub-users-cell-muted" />
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "createdAt":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderUpdatedCell(ext.createdAt ?? ext.updatedAt)}
        </DirectoryTableBodyCell>
      );
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderUpdatedCell(ext.updatedAt)}
        </DirectoryTableBodyCell>
      );
    case "path":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={ext.unpackedPath} title="📁 Extension Path" className="min-w-0 max-w-full">
            <HubDirectoryCopyText
              value={ext.unpackedPath}
              copyToastLabel="Path copied"
              className="hub-directory-table-body-text hub-users-cell-muted min-w-0 max-w-full"
              wrapClassName="min-w-0 max-w-full"
            />
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    case "activityLog": {
      const logText = defaultExtensionLog(ext);
      const swDetail = ext.swHealth ? formatSwHealthDetailLabel(ext.swHealth) : null;
      const toneClass =
        ext.swHealth?.status === "needs-heal" ? "text-amber-300/90" : "text-emerald-300/90";
      const popoverLines = [
        `Extension: ${displayName}`,
        `Kind: ${ext.kind === "store" ? "Chrome Web Store" : "Local Operator"}`,
        ext.version ? `Version: ${ext.version}` : "",
        `Status: ${logText}`,
      ].filter(Boolean);
      if (swDetail) {
        popoverLines.push(`MV3 Service Worker: ${swDetail.text}`);
        if (ext.swHealth?.sampleMissingCodes?.length) {
          popoverLines.push(`Unregistered SW profiles: ${ext.swHealth.sampleMissingCodes.join(", ")}`);
        }
      }
      popoverLines.push(`Path: ${ext.unpackedPath}`);
      const popoverValue = popoverLines.join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverValue} title="📋 Extension Activity Log">
            <span className={`hub-directory-table-body-text block max-w-full truncate ${toneClass}`}>
              {logText}
            </span>
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEmptyCell className="hub-directory-table-body-text hub-users-cell-muted" />
        </DirectoryTableBodyCell>
      );
  }
}
