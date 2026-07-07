export {
  DIRECTORY_CELL_TRUNCATE,
  HubDirectoryEllipsisCell,
  type HubDirectoryEllipsisCellProps,
} from "@tool-workspace/hub-ui";

export function directoryCellTitle(...parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && String(part).trim()).join(" · ");
}
