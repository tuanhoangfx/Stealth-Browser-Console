const fs = require("node:fs");
const path = require("node:path");

/** Remove legacy V4 identity extension artifacts (in-page badge / tab groups). */
function purgeLegacyProfileIdentityChrome(userDataDir, userDataRoot, profileId) {
  const targets = [
    path.join(userDataDir, "stealth-profile-chrome"),
    path.join(userDataDir, ".stealth-identity-ext"),
  ];
  if (userDataRoot && profileId) {
    targets.push(path.join(userDataRoot, "identity-ext", String(profileId)));
  }
  // Keep identity-toolbar/{id} — active minimal toolbar extension.
  for (const target of targets) {
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

module.exports = { purgeLegacyProfileIdentityChrome };
