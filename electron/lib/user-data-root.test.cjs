const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEV_DIR,
  PROD_DIR,
  DEFAULT_DEV_API_PORT,
  DEFAULT_PROD_API_PORT,
  resolveStealthUserDataRoot,
  resolveStealthApiPort,
  configureElectronUserData,
} = require("./user-data-root.cjs");

test("resolveStealthUserDataRoot uses prod folder by default when unpackaged", () => {
  const prev = process.env.STEALTH_DEV_ISOLATED;
  delete process.env.STEALTH_DEV_ISOLATED;
  try {
    const root = resolveStealthUserDataRoot({ packaged: false });
    assert.ok(root.endsWith(PROD_DIR));
  } finally {
    if (prev === undefined) delete process.env.STEALTH_DEV_ISOLATED;
    else process.env.STEALTH_DEV_ISOLATED = prev;
  }
});

test("resolveStealthUserDataRoot uses dev folder when STEALTH_DEV_ISOLATED=1", () => {
  const prev = process.env.STEALTH_DEV_ISOLATED;
  process.env.STEALTH_DEV_ISOLATED = "1";
  try {
    const root = resolveStealthUserDataRoot({ packaged: false });
    assert.ok(root.endsWith(DEV_DIR));
  } finally {
    if (prev === undefined) delete process.env.STEALTH_DEV_ISOLATED;
    else process.env.STEALTH_DEV_ISOLATED = prev;
  }
});

test("resolveStealthUserDataRoot uses prod folder when packaged", () => {
  const root = resolveStealthUserDataRoot({ packaged: true });
  assert.ok(root.endsWith(PROD_DIR));
});

test("resolveStealthUserDataRoot honors STEALTH_USER_DATA", () => {
  const custom = path.join("C:", "custom-stealth");
  const prev = process.env.STEALTH_USER_DATA;
  process.env.STEALTH_USER_DATA = custom;
  try {
    assert.equal(resolveStealthUserDataRoot({ packaged: true }), custom);
    assert.equal(resolveStealthUserDataRoot({ packaged: false }), custom);
  } finally {
    if (prev === undefined) delete process.env.STEALTH_USER_DATA;
    else process.env.STEALTH_USER_DATA = prev;
  }
});

test("resolveStealthApiPort defaults prod unless isolated dev", () => {
  const prevPort = process.env.STEALTH_API_PORT;
  const prevIso = process.env.STEALTH_DEV_ISOLATED;
  delete process.env.STEALTH_API_PORT;
  delete process.env.STEALTH_DEV_ISOLATED;
  try {
    assert.equal(resolveStealthApiPort({ packaged: false }), DEFAULT_PROD_API_PORT);
    process.env.STEALTH_DEV_ISOLATED = "1";
    assert.equal(resolveStealthApiPort({ packaged: false }), DEFAULT_DEV_API_PORT);
    assert.equal(resolveStealthApiPort({ packaged: true }), DEFAULT_PROD_API_PORT);
  } finally {
    if (prevPort === undefined) delete process.env.STEALTH_API_PORT;
    else process.env.STEALTH_API_PORT = prevPort;
    if (prevIso === undefined) delete process.env.STEALTH_DEV_ISOLATED;
    else process.env.STEALTH_DEV_ISOLATED = prevIso;
  }
});

test("configureElectronUserData isolates unpackaged app to dev root + :6004 even if STEALTH_DEV_ISOLATED=0", () => {
  const prevIso = process.env.STEALTH_DEV_ISOLATED;
  const prevPort = process.env.STEALTH_API_PORT;
  const prevUserData = process.env.STEALTH_USER_DATA;
  const prevAllow = process.env.STEALTH_ALLOW_UNPACKAGED_PROD;
  process.env.STEALTH_DEV_ISOLATED = "0";
  process.env.STEALTH_API_PORT = "6003";
  delete process.env.STEALTH_USER_DATA;
  delete process.env.STEALTH_ALLOW_UNPACKAGED_PROD;
  let configuredPath = "";
  try {
    const root = configureElectronUserData({
      isPackaged: false,
      setPath(_k, val) {
        configuredPath = val;
      },
    });
    assert.ok(root.endsWith(DEV_DIR));
    assert.equal(configuredPath, root);
    assert.equal(process.env.STEALTH_API_PORT, String(DEFAULT_DEV_API_PORT));
  } finally {
    if (prevIso === undefined) delete process.env.STEALTH_DEV_ISOLATED;
    else process.env.STEALTH_DEV_ISOLATED = prevIso;
    if (prevPort === undefined) delete process.env.STEALTH_API_PORT;
    else process.env.STEALTH_API_PORT = prevPort;
    if (prevUserData === undefined) delete process.env.STEALTH_USER_DATA;
    else process.env.STEALTH_USER_DATA = prevUserData;
    if (prevAllow === undefined) delete process.env.STEALTH_ALLOW_UNPACKAGED_PROD;
    else process.env.STEALTH_ALLOW_UNPACKAGED_PROD = prevAllow;
  }
});
