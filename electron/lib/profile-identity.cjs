/** Profile short code for taskbar labels — no extension / in-page UI. */

function extractProfileCode(name, id = "") {
  const trimmed = String(name || "").trim();
  const tail = trimmed.match(/(\d{3,5})\s*$/);
  if (tail) return tail[1];
  const any = trimmed.match(/(\d+)/);
  if (any) return any[1].slice(-4);
  return String(id).replace(/-/g, "").slice(0, 4) || "0000";
}

function buildTaskbarLabel(profile) {
  const code = extractProfileCode(profile.name, profile.id);
  const name = String(profile.name || "Profile").trim() || "Profile";
  return `[${code}] ${name}`;
}

/** V2 code-only tile — compact native tooltip (chrome.action.setTitle). */
function buildCodeTileTooltip(profile) {
  const code = extractProfileCode(profile.name, profile.id);
  const group = String(profile.groupName || profile.group || "").trim();
  return group ? `[${code}] · ${group}` : `[${code}]`;
}

/** @deprecated V4 pill chip — popup meta only. */
function buildPillChipText(profile) {
  const code = extractProfileCode(profile.name, profile.id);
  const group = String(profile.groupName || profile.group || "").trim();
  if (!group) return `[${code}]`;
  const short = group.length > 8 ? `${group.slice(0, 7)}…` : group;
  return `[${code}]·${short}`;
}

/** @deprecated Use buildCodeTileTooltip (Design V2). */
function buildPillTooltip(profile) {
  return buildCodeTileTooltip(profile);
}

function buildWindowTitle(profile, pageTitle = "") {
  const code = extractProfileCode(profile.name, profile.id);
  const name = String(profile.name || "Profile").trim() || "Profile";
  const page = String(pageTitle || "").replace(/^\[\d{3,5}\]\s+(?:[^—]+—\s*)?/, "").trim();
  if (!page) return `[${code}] ${name}`;
  return `[${code}] ${name} — ${page}`;
}

module.exports = {
  extractProfileCode,
  buildTaskbarLabel,
  buildCodeTileTooltip,
  buildPillChipText,
  buildPillTooltip,
  buildWindowTitle,
};
