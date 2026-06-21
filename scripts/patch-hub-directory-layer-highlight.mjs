#!/usr/bin/env node
/** Patch hub-ui: search highlight color + KPI/filter z-index layering. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const devRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hubRoots = [
  path.join(devRoot, "packages/hub-ui"),
  path.join(devRoot, "Tool/P0003-Stealth-Browser-Console/vendor/hub-ui"),
  path.join(devRoot, "Tool/P0020-Data-Box/vendor/hub-ui"),
  path.join(devRoot, "Tool/P0004-Tool-Hub/vendor/hub-ui"),
].filter((p) => fs.existsSync(p));

const HIGHLIGHT_CSS = `.hub-directory-search-highlight {
  background: rgba(34, 211, 238, 0.5);
  color: #ffffff;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 700;
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.45);
}
`;

function patchDirectoryTableCss(file) {
  let src = fs.readFileSync(file, "utf8");
  const next = src.replace(
    /\.hub-directory-search-highlight\s*\{[\s\S]*?\}/,
    HIGHLIGHT_CSS.trim(),
  );
  if (next === src) {
    if (!src.includes("hub-directory-search-highlight")) {
      fs.writeFileSync(file, src.trimEnd() + "\n" + HIGHLIGHT_CSS, "utf8");
    }
    return;
  }
  fs.writeFileSync(file, next, "utf8");
}

function patchSplitPaneCss(file) {
  let src = fs.readFileSync(file, "utf8");
  src = src.replace(
    /\.hub-split-directory-pane__filters\s*\{[\s\S]*?z-index:\s*\d+;/,
    `.hub-split-directory-pane__filters {
  position: relative;
  z-index: 8;`,
  );
  if (!src.includes("hub-split-directory-pane__kpi-band {\n  position: relative")) {
    src = src.replace(
      /\.hub-split-directory-pane__kpi-band\s*\{[\s\S]*?\}/,
      `.hub-split-directory-pane__kpi-band {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  min-width: 0;
}`,
    );
  } else {
    src = src.replace(
      /\.hub-split-directory-pane__kpi-band\s*\{[\s\S]*?z-index:\s*\d+;/,
      `.hub-split-directory-pane__kpi-band {
  position: relative;
  z-index: 1;`,
    );
  }
  fs.writeFileSync(file, src, "utf8");
}

for (const hub of hubRoots) {
  const tableCss = path.join(hub, "src/styles/hub-directory-table.css");
  const paneCss = path.join(hub, "src/styles/hub-split-directory-pane.css");
  if (fs.existsSync(tableCss)) {
    patchDirectoryTableCss(tableCss);
    console.log("patched", tableCss);
  }
  if (fs.existsSync(paneCss)) {
    patchSplitPaneCss(paneCss);
    console.log("patched", paneCss);
  }
}

console.log("done");
