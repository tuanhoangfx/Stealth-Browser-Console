/** Directory ID search — aligned with P0020 `matchesTodoTaskSearch` / `extractNumericSearchTerm`. */

const { extractProfileCode } = require("./profile-identity.cjs");

// SSOT: vendor/hub-ui/src/lib/directory-id-search.node.cjs (inlined — vendor/ not in electron asar)
function extractNumericSearchTerm(term) {
  const trimmed = String(term || "").trim();
  if (!trimmed) return null;
  const numericPart = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
  return /^\d+$/.test(numericPart) ? numericPart : null;
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
  const digits = trimmedSearch.replace(/\D/g, "");
  const letters = trimmedSearch.replace(/[\d#]/g, "").trim().toLowerCase();
  if (digits && letters && (!mixedRequiresWhitespace || /\s/.test(trimmedSearch))) {
    return idText.includes(digits) && blob.includes(letters);
  }
  return blob.includes(lower) || (digits.length > 0 && idText.includes(digits));
}

function profileTextBlob(profile) {
  return [
    profile.name,
    profile.groupName ?? profile.group ?? "",
    profile.proxy ?? "",
    profile.startupUrl ?? profile.startup_url ?? "",
    profile.note ?? "",
  ]
    .join("\u0001")
    .toLowerCase();
}

function matchesProfileDirectorySearch(profile, searchTerm) {
  return matchesDirectoryIdSearch(
    { idText: extractProfileCode(profile.name, profile.id), textBlob: profileTextBlob(profile) },
    searchTerm,
    { mixedRequiresWhitespace: true },
  );
}

/** SQL WHERE fragment for profile directory search — never matches fingerprint_seed. */
function buildProfileSearchWhere(term) {
  const trimmedSearch = String(term || "").trim();
  if (!trimmedSearch) return null;

  const numericOnly = extractNumericSearchTerm(trimmedSearch);
  if (numericOnly !== null) {
    return {
      clause: "p.name LIKE ?",
      params: [`%${numericOnly}%`],
      needsGroupJoin: false,
    };
  }

  const digits = trimmedSearch.replace(/\D/g, "");
  const letters = trimmedSearch.replace(/[\d#]/g, "").trim().toLowerCase();

  if (digits && letters && /\s/.test(trimmedSearch)) {
    const likeDigits = `%${digits}%`;
    const likeLetters = `%${letters}%`;
    return {
      clause:
        "(p.name LIKE ? AND (p.note LIKE ? OR p.proxy LIKE ? OR p.startup_url LIKE ? OR g.name LIKE ? OR p.name LIKE ?))",
      params: [likeDigits, likeLetters, likeLetters, likeLetters, likeLetters, likeLetters],
      needsGroupJoin: true,
    };
  }

  const like = `%${trimmedSearch}%`;
  return {
    clause: "(p.name LIKE ? OR p.note LIKE ? OR p.proxy LIKE ? OR p.startup_url LIKE ? OR g.name LIKE ?)",
    params: [like, like, like, like, like],
    needsGroupJoin: true,
  };
}

module.exports = {
  extractNumericSearchTerm,
  matchesProfileDirectorySearch,
  buildProfileSearchWhere,
};
