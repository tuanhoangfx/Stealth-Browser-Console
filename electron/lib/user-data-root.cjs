/**
 * Dev userData: isolated `-dev` folder + API :6004 by default (`STEALTH_DEV_ISOLATED=1`).
 * Packaged / `--prod-data` uses production `stealth-browser-console` + :6003.
 */
const os = require("node:os");
const path = require("node:path");

const PROD_DIR = "stealth-browser-console";
const DEV_DIR = "stealth-browser-console-dev";
const DEFAULT_PROD_API_PORT = 6003;
const DEFAULT_DEV_API_PORT = 6004;

function roamingAppData() {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".config");
}

function isDevIsolated() {
  return process.env.STEALTH_DEV_ISOLATED === "1";
}

function resolveStealthUserDataRoot({ packaged } = {}) {
  if (process.env.STEALTH_USER_DATA) return process.env.STEALTH_USER_DATA;
  if (!packaged && isDevIsolated()) {
    return path.join(roamingAppData(), DEV_DIR);
  }
  return path.join(roamingAppData(), PROD_DIR);
}

function resolveStealthApiPort({ packaged } = {}) {
  if (!packaged && isDevIsolated()) return DEFAULT_DEV_API_PORT;
  const fromEnv = Number(process.env.STEALTH_API_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_PROD_API_PORT;
}

/** Must run before app.ready — sets userData + default dev API port. */
function configureElectronUserData(app) {
  const root = resolveStealthUserDataRoot({ packaged: app.isPackaged });
  app.setPath("userData", root);
  if (!app.isPackaged) {
    if (isDevIsolated()) {
      process.env.STEALTH_API_PORT = String(DEFAULT_DEV_API_PORT);
    } else if (!process.env.STEALTH_API_PORT) {
      process.env.STEALTH_API_PORT = String(DEFAULT_PROD_API_PORT);
    }
  }
  if (!app.isPackaged) {
    console.log(`[user-data] path=${root} isolated=${isDevIsolated() ? "1" : "0"}`);
  }
  return root;
}

module.exports = {
  PROD_DIR,
  DEV_DIR,
  DEFAULT_PROD_API_PORT,
  DEFAULT_DEV_API_PORT,
  roamingAppData,
  isDevIsolated,
  resolveStealthUserDataRoot,
  resolveStealthApiPort,
  configureElectronUserData,
};