#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "../src/styles/hub-directory-table.css");
const css = readFileSync(cssPath, "utf8");

const errors = [];

const selectTd = css.match(
  /table\.hub-users-table\[data-hub-directory-select\] td\.hub-users-col--select\s*\{[^}]+\}/,
)?.[0];
if (!selectTd?.includes("width: 36px")) errors.push("select td missing width: 36px");
if (!selectTd?.includes("padding: 6px 4px")) errors.push("select td missing padding: 6px 4px");
if (!selectTd?.includes("vertical-align: middle")) errors.push("select td missing vertical-align: middle");

const selectRow = css.match(
  /table\.hub-users-table\[data-hub-directory-select\] \.hub-users-select-row\s*\{[^}]+\}/,
)?.[0];
if (!selectRow?.includes("height: 16px")) errors.push("select row label missing height: 16px");
if (!selectRow?.includes("align-items: center")) errors.push("select row label missing align-items: center");

if (errors.length > 0) {
  console.error("verify-hub-directory-select-column-css FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log("verify-hub-directory-select-column-css OK");
