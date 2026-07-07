/**
 * Portable Node SSOT — directory fixed column CSS (code/date only).
 * Import from P00xx scripts: `packages/hub-ui/src/lib/directory-fixed-column-css.mjs`
 */

/** @typedef {'code' | 'date'} DirectoryFixedColumnKind */

/**
 * @typedef {Object} DirectoryFixedColumnEntry
 * @property {string} colClass
 * @property {string} width
 * @property {DirectoryFixedColumnKind} kind
 * @property {readonly string[]} [keys] Tool meta keys — verify gate only, not used in CSS.
 */

/**
 * @typedef {Object} GenerateDirectoryFixedColumnCssOptions
 * @property {readonly DirectoryFixedColumnEntry[]} entries
 * @property {readonly string[]} tableRoots Split head/body table selectors (2+ roots).
 * @property {readonly string[]} [tabularSelectors] Override inner cell selectors for tabular-nums.
 * @property {string} [banner] File header comment.
 */

/**
 * Default tabular-nums targets — date → `.hub-directory-timestamp`, code → `.customer-copy-text`.
 * @param {readonly string[]} tableRoots
 * @param {readonly DirectoryFixedColumnEntry[]} entries
 * @returns {string[]}
 */
export function buildDirectoryFixedColumnTabularSelectors(tableRoots, entries) {
  /** @type {string[]} */
  const selectors = [];
  for (const entry of entries) {
    const inner =
      entry.kind === "date"
        ? ".hub-directory-timestamp"
        : entry.kind === "code"
          ? ".customer-copy-text"
          : null;
    if (!inner) continue;
    for (const root of tableRoots) {
      selectors.push(`${root} td.${entry.colClass} ${inner}`);
    }
  }
  return selectors;
}

/**
 * @param {GenerateDirectoryFixedColumnCssOptions} options
 * @returns {string}
 */
export function generateDirectoryFixedColumnCss(options) {
  const { entries, tableRoots, tabularSelectors, banner } = options;
  const header =
    banner ??
    "/* AUTO-GENERATED — @tool-workspace/hub-ui generateDirectoryFixedColumnCss */";

  /** @param {string} colClass @param {string} width */
  function widthBlock(colClass, width) {
    const selectors = ["col", "th", "td"]
      .flatMap((tag) => tableRoots.map((root) => `${root} ${tag}.${colClass}`))
      .join(",\n");
    return `${selectors} {
  width: ${width};
  min-width: ${width};
  max-width: ${width};
}`;
  }

  const colClasses = entries.map((entry) => entry.colClass);
  const tdAlignSelectors = colClasses
    .flatMap((colClass) => tableRoots.map((root) => `${root} td.${colClass}`))
    .join(",\n");

  const tabular = tabularSelectors ?? buildDirectoryFixedColumnTabularSelectors(tableRoots, entries);

  return `${header}
/* Code/date fixed columns only — edit tool manifest then re-run generator. */

${entries.map((entry) => widthBlock(entry.colClass, entry.width)).join("\n\n")}

${tdAlignSelectors} {
  text-align: left;
}

${tabular.join(",\n")} {
  font-variant-numeric: tabular-nums;
}
`;
}

/**
 * Gate helper — manifest colClass/width must appear in generated CSS.
 * @param {string} css
 * @param {readonly DirectoryFixedColumnEntry[]} entries
 * @returns {string[]} error messages (empty = pass)
 */
export function verifyDirectoryFixedColumnCss(css, entries) {
  return verifyDirectoryColumnWidths(css, entries);
}

/**
 * Gate helper — manifest colClass/width must appear in directory CSS (any column type).
 * @param {string} css
 * @param {readonly Pick<DirectoryFixedColumnEntry, "colClass" | "width">[]} entries
 * @returns {string[]} error messages (empty = pass)
 */
export function verifyDirectoryColumnWidths(css, entries) {
  /** @type {string[]} */
  const errors = [];
  for (const entry of entries) {
    if (!css.includes(`.${entry.colClass}`)) {
      errors.push(`generated CSS missing colClass ${entry.colClass}`);
      continue;
    }
    const widthPattern = new RegExp(
      `\\.${entry.colClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?width:\\s*${entry.width.replace(".", "\\.")}`,
    );
    if (!widthPattern.test(css)) {
      errors.push(`CSS width mismatch for ${entry.colClass} (expected ${entry.width})`);
    }
  }
  return errors;
}

/**
 * Gate helper — meta source keys must match manifest width (+ optional columnKind).
 * @param {string} metaSource Raw column meta TS source.
 * @param {readonly DirectoryFixedColumnEntry[]} entries
 * @param {{ requireColumnKind?: boolean, metaLabel?: string }} [options]
 * @returns {string[]}
 */
export function verifyDirectoryColumnMetaKeys(metaSource, entries, options = {}) {
  const { requireColumnKind = false, metaLabel = "column-meta" } = options;
  /** @type {string[]} */
  const errors = [];
  for (const entry of entries) {
    const keys = entry.keys ?? [];
    for (const key of keys) {
      const keyBlock = metaSource.split(`${key}:`)[1]?.split(/\n  \w+:/)[0] ?? "";
      if (!keyBlock.includes(entry.width)) {
        errors.push(`${metaLabel} ${key} width != manifest ${entry.width} for ${entry.colClass}`);
      }
      if (requireColumnKind && entry.kind && !keyBlock.includes(`columnKind: "${entry.kind}"`)) {
        errors.push(`${metaLabel} ${key} missing columnKind: "${entry.kind}"`);
      }
    }
  }
  return errors;
}
