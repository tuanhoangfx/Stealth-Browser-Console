#!/usr/bin/env node
/** One-shot scaffold: hub-ui directory-id-search + fan-out to tool vendors. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devRoot = path.resolve(root, "../..");

const DIRECTORY_ID_SEARCH_TS = `export type DirectoryIdSearchOptions = {
  mixedRequiresWhitespace?: boolean;
};

export type DirectoryIdSearchInput = {
  idText: string;
  textBlob: string;
};

export function extractNumericSearchTerm(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed) return null;
  const numericPart = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  return /^\\d+$/.test(numericPart) ? numericPart : null;
}

export function matchesDirectoryIdSearch(
  input: DirectoryIdSearchInput,
  searchTerm: string,
  options: DirectoryIdSearchOptions = {},
): boolean {
  const trimmedSearch = searchTerm.trim();
  if (!trimmedSearch) return true;

  const mixedRequiresWhitespace = options.mixedRequiresWhitespace ?? false;
  const { idText, textBlob: blob } = input;
  const numericOnly = extractNumericSearchTerm(trimmedSearch);

  if (numericOnly !== null) {
    return idText.includes(numericOnly);
  }

  const lower = trimmedSearch.toLowerCase();
  const digits = trimmedSearch.replace(/\\D/g, "");
  const letters = trimmedSearch.replace(/[\\d#]/g, "").trim().toLowerCase();

  if (digits && letters && (!mixedRequiresWhitespace || /\\s/.test(trimmedSearch))) {
    return idText.includes(digits) && blob.includes(letters);
  }

  return blob.includes(lower) || (digits.length > 0 && idText.includes(digits));
}

export type DirectorySearchHighlight = {
  idTerms: string[];
  textTerms: string[];
};

export function getDirectorySearchHighlight(
  searchTerm: string,
  options: DirectoryIdSearchOptions = {},
): DirectorySearchHighlight | null {
  const trimmed = searchTerm.trim();
  if (!trimmed) return null;

  const mixedRequiresWhitespace = options.mixedRequiresWhitespace ?? false;
  const numericOnly = extractNumericSearchTerm(trimmed);
  if (numericOnly !== null) {
    return { idTerms: [numericOnly], textTerms: [] };
  }

  const digits = trimmed.replace(/\\D/g, "");
  const letters = trimmed.replace(/[\\d#]/g, "").trim().toLowerCase();

  if (digits && letters && (!mixedRequiresWhitespace || /\\s/.test(trimmed))) {
    return { idTerms: [digits], textTerms: [letters] };
  }

  const lower = trimmed.toLowerCase();
  return {
    idTerms: digits.length > 0 ? [digits] : [],
    textTerms: lower ? [lower] : [],
  };
}

export type HighlightSegment = { text: string; highlight: boolean };

export function buildHighlightSegments(text: string, terms: string[]): HighlightSegment[] {
  if (!text || terms.length === 0) return [{ text, highlight: false }];

  const ranges: { start: number; end: number }[] = [];
  const lower = text.toLowerCase();

  for (const term of terms) {
    const needle = term.trim();
    if (!needle) continue;
    const tLower = needle.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(tLower, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + tLower.length });
      from = idx + 1;
    }
  }

  if (ranges.length === 0) return [{ text, highlight: false }];

  ranges.sort((a, b) => a.start - b.start);
  const merged = [ranges[0]!];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur = ranges[i]!;
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push(cur);
  }

  const segments: HighlightSegment[] = [];
  let pos = 0;
  for (const range of merged) {
    if (pos < range.start) segments.push({ text: text.slice(pos, range.start), highlight: false });
    segments.push({ text: text.slice(range.start, range.end), highlight: true });
    pos = range.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlight: false });
  return segments;
}
`;

const DIRECTORY_ID_SEARCH_TEST_TS = `import { describe, expect, it } from "vitest";
import {
  buildHighlightSegments,
  getDirectorySearchHighlight,
  matchesDirectoryIdSearch,
} from "./directory-id-search";

describe("matchesDirectoryIdSearch", () => {
  it("numeric-only matches idText only", () => {
    expect(matchesDirectoryIdSearch({ idText: "1477", textBlob: "x" }, "1477")).toBe(true);
    expect(matchesDirectoryIdSearch({ idText: "0448", textBlob: "seed 1231477890" }, "1477")).toBe(false);
  });

  it("mixed without whitespace when mixedRequiresWhitespace is false", () => {
    expect(
      matchesDirectoryIdSearch({ idText: "0083", textBlob: "alpha task" }, "00a", { mixedRequiresWhitespace: false }),
    ).toBe(true);
  });

  it("socks5 stays text search when mixedRequiresWhitespace is true", () => {
    expect(
      matchesDirectoryIdSearch({ idText: "0000", textBlob: "socks5://x" }, "socks5", { mixedRequiresWhitespace: true }),
    ).toBe(true);
  });
});

describe("getDirectorySearchHighlight", () => {
  it("splits id vs text terms", () => {
    expect(getDirectorySearchHighlight("1477")).toEqual({ idTerms: ["1477"], textTerms: [] });
    expect(getDirectorySearchHighlight("00a", { mixedRequiresWhitespace: false })).toEqual({
      idTerms: ["00"],
      textTerms: ["a"],
    });
  });
});

describe("buildHighlightSegments", () => {
  it("highlights id fragment", () => {
    expect(buildHighlightSegments("Profile 1477", ["1477"])).toEqual([
      { text: "Profile ", highlight: false },
      { text: "1477", highlight: true },
    ]);
  });
});
`;

const HIGHLIGHT_COMPONENT_TS = `import { useMemo } from "react";
import { buildHighlightSegments } from "../lib/directory-id-search";

type Props = {
  text: string;
  terms: string[];
  className?: string;
  markClassName?: string;
};

export function HubDirectorySearchHighlightText({
  text,
  terms,
  className = "",
  markClassName = "hub-directory-search-highlight",
}: Props) {
  const segments = useMemo(() => buildHighlightSegments(text, terms), [text, terms]);

  if (!terms.length) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark key={index} className={markClassName}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
`;

const NODE_CJS = `function extractNumericSearchTerm(term) {
  const trimmed = String(term || "").trim();
  if (!trimmed) return null;
  const numericPart = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  return /^\\d+$/.test(numericPart) ? numericPart : null;
}

function matchesDirectoryIdSearch(input, searchTerm, options = {}) {
  const trimmedSearch = String(searchTerm || "").trim();
  if (!trimmedSearch) return true;
  const mixedRequiresWhitespace = options.mixedRequiresWhitespace ?? false;
  const idText = input.idText;
  const blob = input.textBlob;
  const numericOnly = extractNumericSearchTerm(trimmedSearch);
  if (numericOnly !== null) return idText.includes(numericOnly);
  const lower = trimmedSearch.toLowerCase();
  const digits = trimmedSearch.replace(/\\D/g, "");
  const letters = trimmedSearch.replace(/[\\d#]/g, "").trim().toLowerCase();
  if (digits && letters && (!mixedRequiresWhitespace || /\\s/.test(trimmedSearch))) {
    return idText.includes(digits) && blob.includes(letters);
  }
  return blob.includes(lower) || (digits.length > 0 && idText.includes(digits));
}

module.exports = { extractNumericSearchTerm, matchesDirectoryIdSearch };
`;

const CSS_SNIPPET = `
.hub-directory-search-highlight {
  background: rgba(250, 204, 21, 0.28);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
`;

const hubTargets = [
  path.join(root, "vendor/hub-ui"),
  path.join(devRoot, "Tool/P0020-Data-Box/vendor/hub-ui"),
  path.join(devRoot, "Tool/P0004-Tool-Hub/vendor/hub-ui"),
  path.join(devRoot, "packages/hub-ui"),
].filter((p) => fs.existsSync(p));

function write(rel, content) {
  for (const hub of hubTargets) {
    const file = path.join(hub, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    console.log("wrote", file);
  }
}

function patchIndex() {
  const exportBlock = `export {
  extractNumericSearchTerm,
  matchesDirectoryIdSearch,
  getDirectorySearchHighlight,
  buildHighlightSegments,
  type DirectoryIdSearchInput,
  type DirectoryIdSearchOptions,
  type DirectorySearchHighlight,
  type HighlightSegment,
} from "./lib/directory-id-search";
export { HubDirectorySearchHighlightText } from "./content/HubDirectorySearchHighlightText";
`;

  for (const hub of hubTargets) {
    const indexFile = path.join(hub, "src/index.ts");
    if (!fs.existsSync(indexFile)) continue;
    let src = fs.readFileSync(indexFile, "utf8");
    if (src.includes("directory-id-search")) {
      console.log("skip index (already patched)", indexFile);
      continue;
    }
    const anchor = 'export { formatHubRelativeTime } from "./lib/format-hub-relative-time";';
    if (!src.includes(anchor)) {
      console.warn("anchor missing in", indexFile);
      continue;
    }
    src = src.replace(anchor, `${anchor}\n${exportBlock}`);
    fs.writeFileSync(indexFile, src, "utf8");
    console.log("patched index", indexFile);
  }
}

function patchCss() {
  for (const hub of hubTargets) {
    const cssFile = path.join(hub, "src/styles/hub-directory-table.css");
    if (!fs.existsSync(cssFile)) continue;
    const src = fs.readFileSync(cssFile, "utf8");
    if (src.includes("hub-directory-search-highlight")) continue;
    fs.writeFileSync(cssFile, src.trimEnd() + CSS_SNIPPET + "\n", "utf8");
    console.log("patched css", cssFile);
  }
}

write("src/lib/directory-id-search.ts", DIRECTORY_ID_SEARCH_TS);
write("src/lib/directory-id-search.test.ts", DIRECTORY_ID_SEARCH_TEST_TS);
write("src/lib/directory-id-search.node.cjs", NODE_CJS);
write("src/content/HubDirectorySearchHighlightText.tsx", HIGHLIGHT_COMPONENT_TS);
patchIndex();
patchCss();
console.log("done");
