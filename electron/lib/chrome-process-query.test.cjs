const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  expandProfileDirAliases,
  siblingStealthRootPath,
  profileDirNeedles,
  buildProfileBrowserPidsPs,
} = require("./chrome-process-query.cjs");
const { PROD_DIR, DEV_DIR } = require("./user-data-root.cjs");

describe("expandProfileDirAliases", () => {
  it("includes sibling prod/dev roots for the same profile UUID", () => {
    const uid = "be7dec19-7129-4710-89f8-c0c705bec7bc";
    const dev = path.join("C:\\Users\\x\\AppData\\Roaming", DEV_DIR, "profiles", uid);
    const prod = path.join("C:\\Users\\x\\AppData\\Roaming", PROD_DIR, "profiles", uid);
    const fromDev = expandProfileDirAliases(dev);
    const fromProd = expandProfileDirAliases(prod);
    assert.ok(fromDev.some((d) => d.includes(DEV_DIR)));
    assert.ok(fromDev.some((d) => d.includes(PROD_DIR) && !d.includes(DEV_DIR)));
    assert.ok(fromProd.some((d) => d.includes(DEV_DIR)));
    assert.ok(fromProd.some((d) => d.includes(PROD_DIR) && !d.includes(DEV_DIR)));
  });

  it("siblingStealthRootPath swaps roots", () => {
    const uid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const dev = path.join("C:\\Roaming", DEV_DIR, "profiles", uid);
    const prod = siblingStealthRootPath(dev);
    assert.ok(prod.includes(PROD_DIR));
    assert.ok(!prod.includes(DEV_DIR));
    assert.equal(siblingStealthRootPath(prod), path.resolve(dev));
  });

  it("PS needles include both roots", () => {
    const uid = "be7dec19-7129-4710-89f8-c0c705bec7bc";
    const dev = path.join("C:\\Users\\x\\AppData\\Roaming", DEV_DIR, "profiles", uid);
    const { needles } = profileDirNeedles(dev);
    assert.ok(needles.length >= 4);
    const joined = needles.join("\n");
    assert.ok(joined.includes(DEV_DIR));
    assert.ok(joined.includes(PROD_DIR));
    const ps = buildProfileBrowserPidsPs(dev);
    assert.ok(ps.includes(PROD_DIR));
    assert.ok(ps.includes(DEV_DIR));
  });

  it("includes AppData logical path for physical custom profilesRoot (reverse junction)", () => {
    const uid = "921d6e41-eae6-4663-a2a8-6a27bb1bc708";
    const physical = path.join("D:\\StealthBrowser\\profiles", uid);
    const aliases = expandProfileDirAliases(physical);
    const joined = aliases.join("\n");
    assert.ok(joined.includes("StealthBrowser"), "keeps physical root");
    assert.ok(joined.includes(PROD_DIR), "adds AppData prod logical path for PWA orphans");
    assert.ok(
      aliases.some((d) => d.includes(path.join(PROD_DIR, "profiles", uid))),
      "must include AppData\\\\stealth-browser-console\\\\profiles\\\\{uuid}",
    );
    const { needles } = profileDirNeedles(physical);
    assert.ok(
      needles.some((n) => n.includes(PROD_DIR) && n.includes(uid)),
      "WMI needles must see AppData path so --user-data-dir=AppData... matches",
    );
  });
});
