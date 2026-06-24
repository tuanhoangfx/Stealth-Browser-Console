/** Profile short code helpers — used for search and lightweight profile labels. */

function extractProfileCode(name, id = "") {
  const trimmed = String(name || "").trim();
  const tail = trimmed.match(/(\d{3,5})\s*$/);
  if (tail) return tail[1];
  const any = trimmed.match(/(\d+)/);
  if (any) return any[1].slice(-4);
  return String(id).replace(/-/g, "").slice(0, 4) || "0000";
}

module.exports = {
  extractProfileCode,
};
