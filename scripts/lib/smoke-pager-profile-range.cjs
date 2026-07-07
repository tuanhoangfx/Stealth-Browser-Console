/** SSOT for smoke pager profile seed/cleanup — names 99001–99021 + note marker. */
const SMOKE_PAGER_MIN_PROFILES = 21;
const SMOKE_RANGE_START = 99001;
const SMOKE_RANGE_END = 99021;
const SMOKE_PAGER_NOTE_MARKERS = ["smoke pager seed", "smoke pager seed — safe to delete", "smoke pager seed — web mock"];

function isSmokePagerProfileName(name) {
  const trimmed = String(name || "").trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= SMOKE_RANGE_START && num <= SMOKE_RANGE_END;
}

function isSmokePagerProfileNote(note) {
  const text = String(note || "").toLowerCase();
  return SMOKE_PAGER_NOTE_MARKERS.some((marker) => text.includes(marker.toLowerCase()));
}

function isSmokePagerProfile(profile) {
  if (!profile) return false;
  return isSmokePagerProfileName(profile.name) || isSmokePagerProfileNote(profile.note);
}

module.exports = {
  SMOKE_PAGER_MIN_PROFILES,
  SMOKE_RANGE_START,
  SMOKE_RANGE_END,
  SMOKE_PAGER_NOTE_MARKERS,
  isSmokePagerProfileName,
  isSmokePagerProfileNote,
  isSmokePagerProfile,
};
