/** Profile code tile (extension) + Windows taskbar overlay — OFF by default for performance. */
function profileIdentityUiEnabled() {
  const raw = String(process.env.STEALTH_PROFILE_IDENTITY_UI ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

module.exports = { profileIdentityUiEnabled };
