import {
  DirectoryTableBodyCell,
  getDirectorySearchHighlight,
  HubDirectorySearchHighlightText,
  HubDirectoryTimestampLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import type { CachedStoreExtension } from "../../../types";
import { resolveExtensionDisplayName } from "../../../lib/extension-display-name";
import type { StealthExtensionsColumnKey } from "../../../lib/directory-column-meta";
import { ExtensionKindBadge } from "./extension-kind-badge";

function renderUpdatedCell(iso?: string) {
  if (!iso) return <span className="hub-directory-table-body-text">—</span>;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <span className="hub-directory-table-body-text">—</span>;
  return <HubDirectoryTimestampLabel at={iso} />;
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
            <HubDirectorySearchHighlightText
              text={displayName}
              terms={nameTerms}
              className="hub-users-name-title truncate"
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
          <span className="hub-directory-table-body-text font-mono">{ext.version || "—"}</span>
        </DirectoryTableBodyCell>
      );
    case "storeId":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text font-mono text-[10px]">
            {ext.storeId || ext.localKey || "—"}
          </span>
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
          <span className="hub-directory-table-body-text max-w-[18rem] truncate font-mono text-[10px]" title={ext.unpackedPath}>
            {ext.unpackedPath}
          </span>
        </DirectoryTableBodyCell>
      );
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">—</span>
        </DirectoryTableBodyCell>
      );
  }
}
