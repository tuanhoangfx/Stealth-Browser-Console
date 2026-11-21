#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(__dirname, "..");
const hubUiModule = resolve(toolRoot, "../../packages/hub-ui/src/lib/directory-fixed-column-css.mjs");
const { generateDirectoryFixedColumnCss } = await import(pathToFileURL(hubUiModule).href);
const outPath = join(__dirname, "../src/styles/p0003-directory-fixed-cols.generated.css");

const GROUPS = [
  {
    banner: "/* AUTO-GENERATED — Workflows (panel & rail) */",
    roots: [
      "table.hub-users-table.stealth-workflow-panel-table[data-hub-directory-select]",
      "table.hub-users-table.stealth-workflow-rail-table[data-hub-directory-select]",
    ],
    entries: [
      { colClass: "hub-users-col--email", width: "10rem", kind: "compact", align: "left" },
      { colClass: "hub-users-col--name", width: "16rem", kind: "code" },
      { colClass: "hub-users-col--id", width: "10rem", kind: "code" },
      { colClass: "hub-users-col--tools", width: "6.5rem", kind: "compact" },
      { colClass: "hub-users-col--created", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--activity", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--metric-b", width: "8rem", kind: "date" },
      { colClass: "hub-users-col--metric-e", width: "15rem", kind: "compact", align: "left" },
    ],
  },
  {
    banner: "/* Workflow Store */",
    roots: [
      "table.hub-users-table.stealth-workflow-store-table[data-hub-directory-select]",
      "table.hub-users-table--directory-6.stealth-workflow-store-table[data-hub-directory-select]",
    ],
    entries: [
      { colClass: "hub-users-col--created", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--activity", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--email", width: "10rem", kind: "compact", align: "left" },
      { colClass: "hub-users-col--name", width: "16rem", kind: "code" },
      { colClass: "hub-users-col--id", width: "7.5rem", kind: "code", align: "center" },
      { colClass: "hub-users-col--role", width: "7rem", kind: "compact" },
      { colClass: "hub-users-col--tools", width: "7rem", kind: "compact" },
      { colClass: "hub-users-col--metric-a", width: "7rem", kind: "compact" },
      { colClass: "hub-users-col--metric-e", width: "15rem", kind: "compact", align: "left" },
    ],
  },
  {
    banner: "/* System Extensions */",
    roots: [
      "table.hub-users-table.stealth-extensions-table[data-hub-directory-select]",
      "table.hub-users-table--directory-6.stealth-extensions-table[data-hub-directory-select]",
    ],
    entries: [
      { colClass: "hub-users-col--created", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--activity", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--name", width: "16rem", kind: "code" },
      { colClass: "hub-users-col--role", width: "6.25rem", kind: "compact" },
      { colClass: "hub-users-col--id", width: "7.5rem", kind: "code", align: "center" },
      { colClass: "hub-users-col--email", width: "12rem", kind: "code" },
      { colClass: "hub-users-col--metric-c", width: "14rem", kind: "code" },
      { colClass: "hub-users-col--metric-e", width: "15rem", kind: "compact", align: "left" },
    ],
  },
  {
    banner: "/* Android Profiles (matches STEALTH_ANDROID_COLUMN_META) */",
    roots: [
      ".stealth-profile-directory-pane table.stealth-android-directory-table[data-hub-directory-select]",
      ".stealth-profile-directory-pane table.stealth-android-directory-table",
    ],
    entries: [
      { colClass: "hub-users-col--activity", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--created", width: "7.25rem", kind: "date" },
      { colClass: "hub-users-col--name", width: "7.25rem", kind: "compact", align: "center" },
      { colClass: "hub-users-col--role", width: "6.75rem", kind: "code" },
      { colClass: "hub-users-col--metric-d", width: "8.75rem", kind: "compact" },
      { colClass: "hub-users-col--tools", width: "6.75rem", kind: "compact" },
      { colClass: "hub-users-col--email", width: "8.75rem", kind: "code" },
      { colClass: "hub-users-col--display-name", width: "8.75rem", kind: "code" },
      { colClass: "hub-users-col--metric-c", width: "8.75rem", kind: "code" },
      { colClass: "hub-users-col--metric-e", width: "8.25rem", kind: "code" },
      { colClass: "hub-users-col--metric-a", width: "7.5rem", kind: "compact" },
      { colClass: "hub-users-col--metric-b", width: "8rem", kind: "compact" },
      { colClass: "hub-users-col--metric-f", width: "8.5rem", kind: "compact" },
      { colClass: "hub-users-col--id", width: "20rem", kind: "code" },
    ],
  },
];

const alignExtras = `
/* Align left-aligned identifier/URL/Proxy/Note/Log bodies in Profiles & Backup directories */
.stealth-profile-directory-frame:not(.stealth-system-backup-directory-frame) table.stealth-profile-directory-table:not(.stealth-android-directory-table) td.hub-users-col--email,
.stealth-profile-directory-frame:not(.stealth-system-backup-directory-frame) table.stealth-profile-directory-table:not(.stealth-android-directory-table) td.hub-users-col--id,
.stealth-profile-directory-frame:not(.stealth-system-backup-directory-frame) table.stealth-profile-directory-table:not(.stealth-android-directory-table) td.hub-users-col--metric-c,
.stealth-profile-directory-frame:not(.stealth-system-backup-directory-frame) table.stealth-profile-directory-table:not(.stealth-android-directory-table) td.hub-users-col--metric-e,
.stealth-system-backup-directory-frame table.stealth-profile-directory-table td.hub-users-col--metric-e {
  text-align: left;
}
`;

const css =
  GROUPS.map((g) =>
    generateDirectoryFixedColumnCss({
      entries: g.entries,
      tableRoots: g.roots,
      banner: g.banner,
    }),
  ).join("\n") + alignExtras;

writeFileSync(outPath, `${css}\n`, "utf8");
console.log(`Wrote ${outPath}`);
