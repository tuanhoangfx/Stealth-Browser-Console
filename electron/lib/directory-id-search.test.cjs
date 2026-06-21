const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  extractNumericSearchTerm,
  matchesProfileDirectorySearch,
  buildProfileSearchWhere,
} = require("./directory-id-search.cjs");

describe("directory-id-search", () => {
  it("extracts numeric-only terms", () => {
    assert.equal(extractNumericSearchTerm("1477"), "1477");
    assert.equal(extractNumericSearchTerm("#1477"), "1477");
    assert.equal(extractNumericSearchTerm("socks5"), null);
  });

  it("numeric search matches profile code only — not fingerprint_seed", () => {
    const hit = { id: "a", name: "1477", fingerprint_seed: 999 };
    const miss = { id: "b", name: "0448", fingerprint_seed: 1231477890 };
    assert.equal(matchesProfileDirectorySearch(hit, "1477"), true);
    assert.equal(matchesProfileDirectorySearch(miss, "1477"), false);
  });

  it("partial numeric id search works", () => {
    const profile = { id: "a", name: "Profile 1477" };
    assert.equal(matchesProfileDirectorySearch(profile, "477"), true);
  });

  it("text search still matches note/proxy fields", () => {
    const profile = { id: "a", name: "Alpha", note: "vip client" };
    assert.equal(matchesProfileDirectorySearch(profile, "vip"), true);
    assert.equal(matchesProfileDirectorySearch(profile, "socks5"), false);
  });

  it("buildProfileSearchWhere excludes fingerprint_seed for numeric terms", () => {
    const where = buildProfileSearchWhere("1477");
    assert.match(where.clause, /p\.name LIKE/);
    assert.doesNotMatch(where.clause, /fingerprint_seed/);
    assert.equal(where.needsGroupJoin, false);
  });
});
