import {
  createDirectoryManualSortPrefs,
  useDirectoryManualSortEnabled,
  type DirectoryManualSortPrefs,
} from "@tool-workspace/hub-ui";

export type StealthManualSortTableId =
  | "p0003-profiles"
  | "p0003-workflow-rail"
  | "p0003-workflow-panel"
  | "p0003-workflow-store"
  | "p0003-backup"
  | "p0003-extensions"
  | "p0003-android";

const PREFS_BY_ID: Record<StealthManualSortTableId, DirectoryManualSortPrefs> = {
  "p0003-profiles": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-profiles:v1",
    changeEvent: "directory-manual-sort-p0003-profiles-change",
  }),
  "p0003-workflow-rail": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-workflow-rail:v1",
    changeEvent: "directory-manual-sort-p0003-workflow-rail-change",
  }),
  "p0003-workflow-panel": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-workflow-panel:v1",
    changeEvent: "directory-manual-sort-p0003-workflow-panel-change",
  }),
  "p0003-workflow-store": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-workflow-store:v1",
    changeEvent: "directory-manual-sort-p0003-workflow-store-change",
  }),
  "p0003-backup": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-backup:v1",
    changeEvent: "directory-manual-sort-p0003-backup-change",
  }),
  "p0003-extensions": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-extensions:v1",
    changeEvent: "directory-manual-sort-p0003-extensions-change",
  }),
  "p0003-android": createDirectoryManualSortPrefs({
    storageKey: "directory-manual-sort:p0003-android:v1",
    changeEvent: "directory-manual-sort-p0003-android-change",
  }),
};

export function useStealthManualSortEnabled(id: StealthManualSortTableId): boolean {
  return useDirectoryManualSortEnabled(PREFS_BY_ID[id]);
}
