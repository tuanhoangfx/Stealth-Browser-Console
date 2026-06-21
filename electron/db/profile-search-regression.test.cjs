const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase, closeDatabase } = require("../db/init.cjs");
const profileService = require("../db/profile-service.cjs");

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stealth-search-regression-"));
  try {
    await openDatabase(tmpRoot);
    const target = "1477";
    for (let i = 0; i < 100; i++) {
      const code = String(i).padStart(4, "0");
      const created = profileService.createProfile({ name: code, note: `seed-${i}` });
      const seed = 1_000_000 + ((i * 7919 + 1477) % 9_000_000);
      profileService.updateProfile(created.id, { fingerprintSeed: seed });
    }
    const exact = profileService.createProfile({ name: target, note: "exact-hit" });
    profileService.updateProfile(exact.id, { fingerprintSeed: 424242 });

    const page = profileService.listProfilesPage({ search: target, limit: 500 });
    const names = page.profiles.map((p) => p.name);
    if (page.total !== 1 || names.length !== 1 || names[0] !== target) {
      throw new Error(`expected only ${target}, got total=${page.total} names=${names.join(", ")}`);
    }
    console.log("profile-search-regression.test: ok");
  } finally {
    closeDatabase();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
