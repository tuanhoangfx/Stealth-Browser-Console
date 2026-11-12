"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const stealthLiveSyncEmitter =
  globalThis._p0003StealthLiveSyncEmitter ||
  (globalThis._p0003StealthLiveSyncEmitter = new EventEmitter());
stealthLiveSyncEmitter.setMaxListeners(100);

function onStealthLiveSyncEvent(listener) {
  if (typeof listener !== "function") return () => {};
  stealthLiveSyncEmitter.on("stealth-sync", listener);
  return () => stealthLiveSyncEmitter.off("stealth-sync", listener);
}

function emitStealthLiveSyncEvent(payload = {}) {
  try {
    stealthLiveSyncEmitter.emit("stealth-sync", payload);
  } catch {
    /* ignore listener error */
  }
}

const P0002_VAULT_DIR_CANDIDATES = [
  "D:\\StealthBrowser\\data\\cookie-vaults",
  path.resolve(__dirname, "..", "..", "..", "..", "P0002-Social-Hub", "data"),
  "E:\\Dev\\Tool\\P0002-Social-Hub\\data",
];

function resolveP0002VaultDir() {
  if (process.env.P0002_DATA_DIR && fs.existsSync(process.env.P0002_DATA_DIR)) {
    return process.env.P0002_DATA_DIR;
  }
  for (const dir of P0002_VAULT_DIR_CANDIDATES) {
    if (fs.existsSync(dir)) return dir;
  }
  return P0002_VAULT_DIR_CANDIDATES[0];
}

const NON_WEB_STATIC_SERVICES = new Set([
  "bank",
  "proxy",
  "proxyfb",
  "proxyv6",
  "proxyvnn",
  "proxy mkvn",
  "smproxy",
  "tm proxy",
  "minproxy",
  "proxy-seller",
  "zingproxy",
  "muaproxy",
  "muaproxyvietnam",
  "vps",
  "vpstocdo",
  "vpssieutoc",
  "vmware",
  "teamviewer",
  "ultraviewer",
  "anydesk",
  "parsec",
  "awesun",
  "splashtop",
  "ugphone",
  "ldphone",
  "active phần mềm crack",
  "foxit reader",
  "kaspersky",
  "bitwarden",
  "proton authenticator",
  "google authenticator",
  "notepad",
  "cameyo portable",
  "ios auto touch",
]);

const GOOGLE_AUTH_SAVE_COOKIE_NAMES = new Set([
  "SID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "LSID",
  "__Host-1PLSID",
  "__Host-3PLSID",
  "__Host-GAPS",
  "OSID",
  "__Secure-OSID",
  "SIDCC",
  "__Secure-1PSIDCC",
  "__Secure-3PSIDCC",
]);

function isGoogleAuthSaveCookie(d, n, allowYoutube = false) {
  if (!GOOGLE_AUTH_SAVE_COOKIE_NAMES.has(n)) return false;
  return d.includes("google.") || (allowYoutube && d.includes("youtube.com"));
}

const SERVICE_COOKIE_MATCHERS = {
  gmail: {
    family: "gmail",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google mail": {
    family: "gmail",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google one": {
    family: "google_one",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "goole one": {
    family: "google_one",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google cloud": {
    family: "google_cloud",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google flow": {
    family: "google_flow",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google labs": {
    family: "google_labs",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "veo 3": {
    family: "google_labs",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google ai studio": {
    family: "google_ai_studio",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  gemini: {
    family: "gemini",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google gemini": {
    family: "gemini",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  notebooklm: {
    family: "notebooklm",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google drive": {
    family: "google_drive",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "google workspace": {
    family: "google_workspace",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  "vertex ai": {
    family: "vertex_ai",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, false),
  },
  youtube: {
    family: "youtube",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, true),
  },
  "youtube studio": {
    family: "youtube",
    resultCode: "google_cookies",
    requiresAll: ["SID", "SAPISID"],
    match: (d, n) => isGoogleAuthSaveCookie(d, n, true),
  },
  outlook: {
    family: "outlook",
    resultCode: "outlook_cookies",
    match: (d, n) =>
      (d.includes("live.com") ||
        d.includes("outlook.com") ||
        d.includes("office.com") ||
        d.includes("microsoft.com") ||
        d.includes("microsoftonline.com") ||
        d.includes("hotmail.com")) &&
      (n === "RPSSecAuth" ||
        n === "MSNRPSAuth" ||
        n === "__Host-MSAAUTHP" ||
        n === "__Host-MSAAUTH" ||
        n === "WLSSC" ||
        n === "ESTSAUTH" ||
        n === "ESTSAUTHPERSISTENT" ||
        n === "OwaUserState"),
  },
  hotmail: {
    family: "outlook",
    resultCode: "outlook_cookies",
    match: (d, n) => SERVICE_COOKIE_MATCHERS.outlook.match(d, n),
  },
  microsoft: {
    family: "outlook",
    resultCode: "outlook_cookies",
    match: (d, n) => SERVICE_COOKIE_MATCHERS.outlook.match(d, n),
  },
  "microsoft office": {
    family: "microsoft_office",
    resultCode: "outlook_cookies",
    match: (d, n) => SERVICE_COOKIE_MATCHERS.outlook.match(d, n),
  },
  facebook: {
    family: "facebook",
    resultCode: "facebook_cookies",
    requiresAll: ["c_user", "xs"],
    match: (d, n) => d.includes("facebook.com") && (n === "c_user" || n === "xs"),
  },
  tiktok: {
    family: "tiktok",
    resultCode: "tiktok_cookies",
    match: (d, n) =>
      d.includes("tiktok.com") &&
      (n === "sessionid" || n === "sessionid_ss" || n === "sid_tt"),
  },
  chatgpt: {
    family: "chatgpt",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      (d.includes("chatgpt.com") || d.includes("openai.com")) &&
      (n.includes("__Secure-next-auth.session-token") ||
        n === "next-auth.session-token" ||
        (v === undefined && (n === "_account" || n === "oai-did"))),
  },
  "sora openai": {
    family: "chatgpt",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      (d.includes("sora.com") || d.includes("chatgpt.com") || d.includes("openai.com")) &&
      (n.includes("__Secure-next-auth.session-token") ||
        n === "next-auth.session-token" ||
        (v === undefined && (n === "_account" || n === "oai-did" || n === "_puid"))),
  },
  claude: {
    family: "claude",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      d.includes("claude.ai") &&
      (n === "sessionKey" || (v === undefined && n === "lastActiveOrg")),
  },
  capcut: {
    family: "capcut",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      d.includes("capcut.com") &&
      (((n === "sessionid" || n === "sessionid_ss" || n === "sid_tt") &&
        !String(v || "").startsWith("spa_") &&
        !String(v || "").startsWith("sso_")) ||
        (v === undefined &&
          /^(sid_guard|uid_tt|uid_tt_ss|odin_tt|store-idc|cc-target-idc|tt-target-idc-sign|store-country-code|store-country-code-src|store-country-sign|tt_session_tlb_tag)$/i.test(
            n,
          ))),
  },
  cursor: {
    family: "cursor",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("cursor.com") || d.includes("cursor.sh")) &&
      (n === "WorkosCursorSessionToken" || n === "WorkOSCursorSessionToken"),
  },
  elevenlabs: {
    family: "elevenlabs",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("elevenlabs.io") &&
      (n === "__session" ||
        n === "xi-api-key" ||
        /^(session_token|auth_token|access_token|refresh_token)$/i.test(n)),
  },
  adobe: {
    family: "adobe",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      (d.includes("adobe.com") || d.includes("adobelogin.com")) &&
      (n === "aux_sid" ||
        n === "ims_sid" ||
        n === "SIS" ||
        n.includes("fg_cts") ||
        n.includes("ims_token") ||
        (v === undefined && (n === "ftr_set" || n === "s_ac" || n === "ID" || n === "RMR" || n === "guid"))),
  },
  "vpn surfshark": {
    family: "surfshark",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("surfshark.com") &&
      (n.includes("jwt") || n.includes("access_token") || n === "ss_auth") &&
      !/^(__cf|_cf|_ga|_fbp)/i.test(n),
  },
  grok: {
    family: "grok",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("grok.com") || d.includes("x.ai") || d.includes("x.com")) &&
      (n === "auth_token" || n === "sso" || n === "sso-rw"),
  },
  "sync.so": {
    family: "sync.so",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("sync.so") &&
      (n === "__session" ||
        n.startsWith("__session_") ||
        n.includes("sync.session") ||
        n === "sync-auth-session" ||
        n === "__client"),
  },
  higgsfield: {
    family: "higgsfield",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("higgsfield.ai") &&
      (n === "__session" || n.startsWith("__session_") || n === "__client" || n === "higgsfield-auth-session"),
  },
  perplexity: {
    family: "perplexity",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      d.includes("perplexity.ai") &&
      (n === "__Secure-next-auth.session-token" ||
        n.startsWith("__Secure-next-auth.session-token.") ||
        n === "next-auth.session-token" ||
        n.startsWith("next-auth.session-token.") ||
        n === "pplx.session-token" ||
        n.startsWith("__Secure-pplx.session.") ||
        (v === undefined && (n === "pplx.session-id" || n === "__Secure-next-auth.callback-url"))),
  },
  suno: {
    family: "suno",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("suno.com") || d.includes("suno.ai")) &&
      (n === "__session" || n.startsWith("__session_") || n === "__client" || n === "suno-auth-session"),
  },
  heygen: {
    family: "heygen",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("heygen.com") &&
      (n === "heygen_session" || n === "heygen_token" || n === "user_token" || n === "auth_token" || n === "access_token"),
  },
  kling: {
    family: "kling",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("klingai.com") || d.includes("kling.ai")) &&
      (n.includes("portal_st") || n.includes("web_st") || n.includes("passToken")),
  },
  canva: {
    family: "canva",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      (d.includes("canva.com") || d.includes("canva.cn")) &&
      (n === "AAT" ||
        n === "CAS" ||
        n === "CRT" ||
        n === "CAU" ||
        n === "CUI" ||
        (v === undefined && (n === "XSRF-TOKEN" || n === "cid"))),
  },
  github: {
    family: "github",
    resultCode: "service_cookies",
    match: (d, n, v) =>
      d.includes("github.com") &&
      (n === "user_session" ||
        n === "__Host-user_session_same_site" ||
        (v === undefined && (n === "dotcom_user" || n === "logged_in" || n === "_gh_sess"))),
  },
  "github copilot": {
    family: "github",
    resultCode: "service_cookies",
    match: (d, n, v) => SERVICE_COOKIE_MATCHERS.github.match(d, n, v),
  },
  "vpn express": {
    family: "expressvpn",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("expressvpn.com") &&
      (n === "KEYCLOAK_IDENTITY" ||
        n === "KEYCLOAK_SESSION" ||
        n === "access_session" ||
        n === "id_session" ||
        n === "refresh_session"),
  },
  expressvpn: {
    family: "expressvpn",
    resultCode: "service_cookies",
    match: (d, n) => SERVICE_COOKIE_MATCHERS["vpn express"].match(d, n),
  },
  "vpn nord": {
    family: "nordvpn",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("nordaccount.com") || d.includes("nordvpn.com")) &&
      (n === "token" || n === "access_token" || n === "nord_session"),
  },
  nordvpn: {
    family: "nordvpn",
    resultCode: "service_cookies",
    match: (d, n) => SERVICE_COOKIE_MATCHERS["vpn nord"].match(d, n),
  },
  kalodata: {
    family: "kalodata",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("kalodata.com") &&
      n !== "AGL_USER_ID" &&
      n !== "ARID" &&
      (n === "SESSION" || n === "kalodata_token" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  adflex: {
    family: "adflex",
    resultCode: "service_cookies",
    match: (d, n) =>
      (d.includes("adflex.vn") || d.includes("adflex.io")) &&
      /(session|token|auth|uid|user|jwt)/i.test(n),
  },
  minea: {
    family: "minea",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("minea.com") &&
      /(session|token|auth|uid|user|jwt)/i.test(n),
  },
  pipiads: {
    family: "pipiads",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("pipiads.com") &&
      /(session|token|auth|uid|user|jwt)/i.test(n),
  },
  "twitter (x)": {
    family: "twitter",
    resultCode: "service_cookies",
    match: (d, n) => (d.includes("x.com") || d.includes("twitter.com")) && n === "auth_token",
  },
  twitter: {
    family: "twitter",
    resultCode: "service_cookies",
    match: (d, n) => (d.includes("x.com") || d.includes("twitter.com")) && n === "auth_token",
  },
  x: {
    family: "twitter",
    resultCode: "service_cookies",
    match: (d, n) => (d.includes("x.com") || d.includes("twitter.com")) && n === "auth_token",
  },
  instagram: {
    family: "instagram",
    resultCode: "instagram_cookies",
    match: (d, n) => d.includes("instagram.com") && n === "sessionid",
  },
  topview: {
    family: "topview",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("topview.ai") &&
      (n === "topview_token" || n === "access_token" || n === "auth_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  vidiq: {
    family: "vidiq",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("vidiq.com") &&
      (n === "auth_token" || n === "vidiq_session" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  runway: {
    family: "runway",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("runwayml.com") &&
      (n === "rw_token" ||
        n === "rw_auth_token" ||
        n === "access_token" ||
        n === "session_token" ||
        n === "jwt") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  freepik: {
    family: "freepik",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("freepik.com") &&
      (n === "GR_TOKEN" || n === "GR_REFRESH") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  spotify: {
    family: "spotify",
    resultCode: "service_cookies",
    match: (d, n) => d.includes("spotify.com") && n === "sp_dc",
  },
  netflix: {
    family: "netflix",
    resultCode: "service_cookies",
    match: (d, n) => d.includes("netflix.com") && (n === "NetflixId" || n === "SecureNetflixId"),
  },
  midjourney: {
    family: "midjourney",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("midjourney.com") &&
      (n.includes("__Host-next-auth.session-token") ||
        n.includes("__Secure-next-auth.session-token") ||
        n.includes("next-auth.session-token") ||
        n === "_mj_session") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  discord: {
    family: "discord",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("discord.com") &&
      (n === "token" || n === "__Secure-session") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  vercel: {
    family: "vercel",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("vercel.com") &&
      (n === "authorization" || n === "token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  supabase: {
    family: "supabase",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("supabase.com") &&
      (n.includes("auth-token") || n === "sb-access-token" || n === "sb-refresh-token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  kalowave: {
    family: "kalowave",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("kalowave.com") &&
      (n.includes("token") || n.includes("session") || n.includes("auth")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  "glm coding (z.ai)": {
    family: "zai",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      (d.includes("z.ai") || d.includes("chatglm.cn")) &&
      (n === "token" || n === "chatglm_token" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  deevid: {
    family: "deevid",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("deevid.ai") &&
      (n.includes("token") || n.includes("session") || n.includes("auth")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  bigspy: {
    family: "bigspy",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("bigspy.com") &&
      (n.includes("token") || n.includes("session") || n.includes("auth") || n.includes("uid")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  hailuo: {
    family: "hailuo",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("hailuoai.video") &&
      (n.includes("token") || n.includes("session") || n.includes("auth")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  runninghub: {
    family: "runninghub",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("runninghub.ai") &&
      (n === "rh_token" || n === "access_token" || n === "Authorization") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  genspark: {
    family: "genspark",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("genspark.ai") &&
      (n === "session_id" || n === "gs_token" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  windsurf: {
    family: "windsurf",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      (d.includes("codeium.com") || d.includes("windsurf.com")) &&
      (n.includes("token") || n.includes("session") || n.includes("auth")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  "leonardo ai": {
    family: "leonardo",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("leonardo.ai") &&
      !n.startsWith("ab.storage.") &&
      !String(v).startsWith("spa_") &&
      (n.includes("__Secure-better-auth.session_token") ||
        n.includes("__Host-better-auth.session_token") ||
        n.includes("better-auth.session_token") ||
        n.includes("__Secure-next-auth.session-token") ||
        n.includes("__Host-next-auth.session-token") ||
        n.includes("next-auth.session-token") ||
        n === "leonardo-auth-session" ||
        n === "accessToken" ||
        n === "refreshToken"),
  },
  "leonardo.ai": {
    family: "leonardo",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("leonardo.ai") &&
      !n.startsWith("ab.storage.") &&
      !String(v).startsWith("spa_") &&
      (n.includes("__Secure-better-auth.session_token") ||
        n.includes("__Host-better-auth.session_token") ||
        n.includes("better-auth.session_token") ||
        n.includes("__Secure-next-auth.session-token") ||
        n.includes("__Host-next-auth.session-token") ||
        n.includes("next-auth.session-token") ||
        n === "leonardo-auth-session" ||
        n === "accessToken" ||
        n === "refreshToken"),
  },
  zoom: {
    family: "zoom",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("zoom.us") &&
      (n.includes("_zm_ssid") || n.includes("_zm_login")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  "trading view": {
    family: "tradingview",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("tradingview.com") &&
      (n === "sessionid" || n === "auth_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  exness: {
    family: "exness",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("exness.com") &&
      (n === "JWT" || n === "jwt" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  litefinance: {
    family: "litefinance",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("litefinance.org") &&
      (n.includes("token") || n.includes("auth")) &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  "vt markets": {
    family: "vtmarkets",
    resultCode: "service_cookies",
    match: (d, n, v = "") =>
      d.includes("vtmarkets.com") &&
      (n === "token" || n === "access_token") &&
      !String(v).startsWith("spa_") &&
      !String(v).startsWith("sso_"),
  },
  telegram: {
    family: "telegram",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("telegram.org") && (n === "stel_token" || n === "stel_ssid" || n === "stel_ln"),
  },
  "2captcha": {
    family: "2captcha",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("2captcha.com") && (n === "auth_token" || n === "user" || n === "session"),
  },
  capsolver: {
    family: "capsolver",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("capsolver.com") && (n === "accessToken" || n === "token" || n === "session"),
  },
  omocaptcha: {
    family: "omocaptcha",
    resultCode: "service_cookies",
    match: (d, n) =>
      d.includes("omocaptcha.com") &&
      (n.includes("__Secure-next-auth.session-token") ||
        n.includes("__Host-next-auth.session-token") ||
        n.includes("next-auth.session-token")),
  },
};

function isAnonymousOrTrackingCookieName(name = "") {
  const n = String(name || "").trim();
  if (!n) return true;
  if (
    /^(PHPSESSID|JSESSIONID|ASP\.NET_SessionId|ASPSESSIONID[A-Z0-9]*|CFID|CFTOKEN|laravel_session|ci_session|connect\.sid|_session_id|session_locale|sessions_bag|sequelSessionId|sequelUserId|did|__ssid|__cuid|_twsid|_uetsid|_uetvid|tt_webid|tt_webid_v2|ttwid|msToken|odin_tt|uid_tt|passport_csrf_token|passport_csrf_token_default|csrf_session_id|__Host-next-auth\.csrf-token|__Secure-next-auth\.callback-url|next-auth\.csrf-token|next-auth\.callback-url|oai-did|oai-hm|oai-nav-state|oai-sc|PPLState|OParams|SDIDC|MSPOK|DefaultAnchorMailbox|MSPProf|BAAF|CIT|gtm_session|logged_in|web_ph|pplx\.visitor-id|pplx\.session-id|pplx\.edge-vid|pplx\.edge-sid|pplx-session-token|grok-auth-session|suno-auth-session|heygen-auth-session|hf-auth-session|sync-auth-session|runway-auth-session|kling-auth-session|topview-auth-session|CanvaSession|freepik-auth-session|cursor_session|leonardo-auth-session|xi-auth-session|adobe-auth-session|muse-auth-session|chatgpt-auth-session|claude-auth-session|capcut-auth-session|github-auth-session|surfshark-auth-session|youtube-auth-session)$/i.test(
      n,
    )
  ) {
    return true;
  }
  if (
    /^(__cf|_cf|cf_|_ga|_gid|_gat|_fbp|_fbc|_gcl|_uetsid|_uetvid|_clck|_clsk|_hj|ajs_|mp_|ph_|intercom|crisp-client|amplitude|mixpanel| PostHog|ttcsid|__stripe|_mpxl|csrf|xsrf|XSRF-TOKEN|_csrf|sidebar|theme|locale|lang|consent|cookie_consent|anon|guest|visitor|device_id|client_id|browser_id|ab_test|experiment)/i.test(
      n,
    )
  ) {
    return true;
  }
  if (/(csrf|xsrf|callback-url|pkce|code_verifier|oauth_state|login_hint|anon_id|visitor_id|device_id|crisp-client)/i.test(n)) {
    return true;
  }
  return false;
}

function isSyntheticOrUnauthenticatedCookieValue(value = "") {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (/^(sso_|spa_|firebase_sso_)/i.test(v)) return true;
  if (/HealedSession|1730499200|1730498000|disk_verified_sqlite/i.test(v)) return true;
  if (/^(no|false|0|null|undefined|anonymous|guest|logged_out|disabled|deleted)$/i.test(v)) return true;
  return false;
}

function resolveServiceMatcher(serviceName = "") {
  const s = String(serviceName || "").trim().toLowerCase();
  if (!s || NON_WEB_STATIC_SERVICES.has(s)) return null;
  if (SERVICE_COOKIE_MATCHERS[s]) return SERVICE_COOKIE_MATCHERS[s];
  const domainMatch = s.match(/^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/.*)?$/i);
  if (domainMatch && !s.includes("@") && !s.includes(" ")) {
    const host = domainMatch[1].toLowerCase().replace(/^www\./, "");
    return {
      family: host,
      resultCode: "service_cookies",
      match: (d, n) =>
        d.includes(host) &&
        !isAnonymousOrTrackingCookieName(n) &&
        /(session_token|auth_token|access_token|refresh_token|id_token|remember_token|remember_web|user_session|logged_in|jwt)/i.test(
          n,
        ),
    };
  }
  return null;
}

/**
 * Reads Chromium `Default/Local Storage/leveldb` and `Default/IndexedDB` metadata
 * for SPA services (`ElevenLabs`, `CapCut`, `HeyGen`, `Adobe`, `Sync.so`, `Higgsfield`, `Suno`, `Kling`, etc.)
 * that persist Firebase / Clerk / IMS / OAuth tokens in LocalStorage or IndexedDB rather than SQLite `Cookies`.
 */
function readProfileSpaStorageSummary(userDataDir, { includeElevenLabsIdb = true } = {}) {
  const empty = { localStorageText: "", indexedDbFolders: [], idbTextByHost: {} };
  if (!userDataDir) return empty;
  const defDir = path.join(userDataDir, "Default");
  const lsDir = path.join(defDir, "Local Storage", "leveldb");
  const idbDir = path.join(defDir, "IndexedDB");

  let localStorageText = "";
  if (fs.existsSync(lsDir)) {
    try {
      const files = fs.readdirSync(lsDir).filter((f) => /\.(ldb|log)$/i.test(f));
      const chunks = [];
      for (const f of files) {
        try {
          const p = path.join(lsDir, f);
          const st = fs.statSync(p);
          if (st.size > 0 && st.size <= 4 * 1024 * 1024) {
            chunks.push(fs.readFileSync(p).toString("latin1").replace(/\x00/g, ""));
          }
        } catch {
          /* ignore locked file */
        }
      }
      localStorageText = chunks.join("\n");
    } catch {
      /* ignore */
    }
  }

  let indexedDbFolders = [];
  const idbTextByHost = {};
  const idbBytesByHost = {};
  if (fs.existsSync(idbDir)) {
    try {
      indexedDbFolders = fs
        .readdirSync(idbDir)
        .filter((f) => f.endsWith(".indexeddb.leveldb") && !f.includes("chrome-extension"));
      for (const folder of indexedDbFolders) {
        if (!includeElevenLabsIdb && folder.includes("elevenlabs.io")) continue;
        if (!/elevenlabs\.io|mage\.space|leonardo\.ai|runwayml\.com|topview\.ai|vidiq\.com/i.test(folder)) {
          continue;
        }
        const fullFolder = path.join(idbDir, folder);
        try {
          const files = fs.readdirSync(fullFolder).filter((f) => /\.(ldb|log)$/i.test(f));
          const chunks = [];
          let totalBytes = 0;
          for (const f of files) {
            try {
              const p = path.join(fullFolder, f);
              const st = fs.statSync(p);
              if (st.size > 0) {
                totalBytes += st.size;
                const maxBytes =
                  folder.includes("elevenlabs.io") || folder.includes("mage.space") ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
                if (st.size <= maxBytes) {
                  const rawBuf = fs.readFileSync(p);
                  chunks.push(rawBuf.toString("latin1").replace(/\x00/g, ""));
                  if (folder.includes("elevenlabs.io") || folder.includes("mage.space")) {
                    chunks.push(rawBuf.toString("utf16le").replace(/\x00/g, ""));
                  }
                }
              }
            } catch {
              /* ignore */
            }
          }
          idbTextByHost[folder] = chunks.join("\n");
          idbBytesByHost[folder] = totalBytes;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { localStorageText, indexedDbFolders, idbTextByHost, idbBytesByHost };
}

function matchServiceSpaStorage(serviceName, spaSummary) {
  if (!spaSummary) return { matched: false, evidence: "" };
  const s = String(serviceName || "").trim().toLowerCase();
  const ls = spaSummary.localStorageText || "";
  const idbFolders = spaSummary.indexedDbFolders || [];
  const idbText = spaSummary.idbTextByHost || {};

  if (s === "elevenlabs") {
    const idbKey = idbFolders.find((f) => f.includes("elevenlabs.io"));
    const elIdbText = idbKey ? idbText[idbKey] || "" : "";
    const combinedElText = `${elIdbText}\n${ls}`;
    const rtMatch = combinedElText.match(/(?:AEu4IL|AMf-)[A-Za-z0-9_-]{60,}/);
    const firebaseRefreshToken = rtMatch ? rtMatch[0] : "";
    if (
      idbKey &&
      /stsTokenManager[\s\S]{0,400}?refreshToken|AMf-[A-Za-z0-9_-]{20,}|AIzaSyBSsRE_1Os04[\s\S]{0,600}?refreshToken/i.test(
        elIdbText,
      )
    ) {
      const emailMatch =
        elIdbText.match(/"email"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/i) ||
        elIdbText.match(/\b([a-zA-Z0-9._%+-]+@(?:gmail|googlemail|outlook|hotmail|live|icloud|yahoo|infi28|cloudaimail)\.[a-zA-Z]{2,})\b/i);
      const accountEmail = emailMatch ? normalizeComparableEmail(emailMatch[1]) : "";
      return { matched: true, evidence: "IndexedDB:firebaseLocalStorage", accountEmail, firebaseRefreshToken };
    }
    if (/_https:\/\/(?:[a-z0-9-]+\.)?elevenlabs\.io[\x01][^\x01\n]*firebase:authUser/i.test(ls)) {
      return { matched: true, evidence: "LocalStorage:elevenlabs.io", firebaseRefreshToken };
    }
  } else if (s === "mage.space" || s === "mage") {
    const idbKey = idbFolders.find((f) => f.includes("mage.space"));
    const mageIdbText = idbKey ? idbText[idbKey] || "" : "";
    const combinedMageText = `${mageIdbText}\n${ls}`;
    const rtMatch = combinedMageText.match(/(?:AEu4IL|AMf-)[A-Za-z0-9_-]{60,}/);
    const firebaseRefreshToken = rtMatch ? rtMatch[0] : "";
    if (
      idbKey &&
      /stsTokenManager[\s\S]{0,400}?refreshToken|(?:AEu4IL|AMf-)[A-Za-z0-9_-]{40,}|AIzaSyAzUV2NNUOlLTL04jwmUw9oLhjteuv6Qr4[\s\S]{0,600}?refreshToken/i.test(
        mageIdbText,
      )
    ) {
      const emailMatch =
        mageIdbText.match(/"email"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/i) ||
        mageIdbText.match(/\b([a-zA-Z0-9._%+-]+@(?:gmail|googlemail|outlook|hotmail|live|icloud|yahoo|infi28|cloudaimail)\.[a-zA-Z]{2,})\b/i);
      const accountEmail = emailMatch ? normalizeComparableEmail(emailMatch[1]) : "";
      return { matched: true, evidence: "IndexedDB:firebaseLocalStorage(mage.space)", accountEmail, firebaseRefreshToken };
    }
    if (/_https:\/\/(?:[a-z0-9-]+\.)?mage\.space[\x01][^\x01\n]*firebase:authUser/i.test(ls)) {
      return { matched: true, evidence: "LocalStorage:mage.space", firebaseRefreshToken };
    }
  } else if (s === "higgsfield") {
    if (/higgsfield/i.test(ls) && /refreshToken|accessToken|idToken/i.test(ls) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(ls)) {
      return { matched: true, evidence: "LocalStorage:higgsfield" };
    }
  } else if (s === "discord") {
    if (ls.includes("discord.com") && /"[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}"/.test(ls)) {
      return { matched: true, evidence: "LocalStorage:discord_token" };
    }
  } else if (s === "leonardo ai") {
    const leoIdb = idbFolders.find((f) => f.includes("app.leonardo.ai"));
    const leoText = leoIdb ? idbText[leoIdb] || "" : "";
    const leoOriginRe = /_https:\/\/(?:[a-z0-9-]+\.)?leonardo\.ai[\x01]([^\x01\n]{2,64})[\x01][\s\S]{1,20}?[\x01]([\x20-\x7e]{2,500})/gi;
    const leoOriginMatch = [...ls.matchAll(leoOriginRe)].some(
      (m) => /next-auth|cognito|amplify|idToken|accessToken|refreshToken/i.test(m[1]) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(m[2]),
    );
    if (
      leoOriginMatch ||
      (/refreshToken|accessToken|idToken/i.test(leoText) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(leoText))
    ) {
      return { matched: true, evidence: "LocalStorage+IDB:leonardo.ai" };
    }
  } else if (s === "runway") {
    const rwText = idbFolders
      .filter((f) => f.includes("runwayml.com"))
      .map((f) => idbText[f] || "")
      .join("\n");
    const rwOriginRe = /_https:\/\/(?:[a-z0-9-]+\.)?runwayml\.com[\x01]([^\x01\n]{2,64})[\x01][\s\S]{1,20}?[\x01]([\x20-\x7e]{2,500})/gi;
    const rwOriginMatch = [...ls.matchAll(rwOriginRe)].some((m) => {
      const k = m[1];
      const v = m[2].trim();
      if (k === "RW_USER_TOKEN") return !/^"?anonymous"?$/i.test(v) && v.length >= 24 && /eyJ[A-Za-z0-9_-]{20,}/.test(v);
      return (/auth0|access_token|refresh_token|id_token/i.test(k)) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(v);
    });
    if (
      rwOriginMatch ||
      (/refresh_?token|access_?token/i.test(rwText) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(rwText))
    ) {
      return { matched: true, evidence: "LocalStorage+IDB:runwayml.com" };
    }
  } else if (s === "topview") {
    const tvIdb = idbFolders.find((f) => f.includes("topview.ai"));
    const tvText = tvIdb ? idbText[tvIdb] || "" : "";
    const tvOriginRe = /_https:\/\/(?:[a-z0-9-]+\.)?topview\.ai[\x01]([^\x01\n]{2,64})[\x01][\s\S]{1,20}?[\x01]([\x20-\x7e]{2,500})/gi;
    const tvOriginMatch = [...ls.matchAll(tvOriginRe)].some(
      (m) => /token|access_token|refresh_token|auth/i.test(m[1]) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(m[2]),
    );
    if (
      tvOriginMatch ||
      (/refresh_?token|access_?token/i.test(tvText) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(tvText))
    ) {
      return { matched: true, evidence: "LocalStorage+IDB:topview.ai" };
    }
  } else if (s === "vidiq") {
    const vqIdb = idbFolders.find((f) => f.includes("app.vidiq.com"));
    const vqText = vqIdb ? idbText[vqIdb] || "" : "";
    const vqOriginRe = /_https:\/\/(?:[a-z0-9-]+\.)?vidiq\.com[\x01]([^\x01\n]{2,64})[\x01][\s\S]{1,20}?[\x01]([\x20-\x7e]{2,500})/gi;
    const vqOriginMatch = [...ls.matchAll(vqOriginRe)].some(
      (m) => /auth_token|access_token|refresh_token|jwt/i.test(m[1]) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(m[2]),
    );
    if (
      vqOriginMatch ||
      (/refresh_?token|access_?token/i.test(vqText) && /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(vqText))
    ) {
      return { matched: true, evidence: "LocalStorage+IDB:app.vidiq.com" };
    }
  } else if (s === "telegram") {
    const hasTgOrigin = ls.includes("web.telegram.org");
    const hasTgWebKAuth =
      hasTgOrigin &&
      (/_https:\/\/web\.telegram\.org[\x01\s]user_auth[\s\S]{0,160}?"id"\s*:\s*"?[1-9]\d{4,}/i.test(ls) ||
        /[1-9]\d{4,}"?\s*,\s*"dcID"\s*:\s*[1-5]\}/i.test(ls)) &&
      /dc[1-5]_auth_key/i.test(ls);
    const hasTgWebAAuth =
      hasTgOrigin &&
      /"currentUserId"\s*:\s*"?[1-9]\d{4,}/i.test(ls) &&
      /dc[1-5]_auth_key/i.test(ls);
    if (hasTgWebKAuth || hasTgWebAAuth) {
      return { matched: true, evidence: "LocalStorage:web.telegram.org(user_auth+dc_auth_key)" };
    }
  } else if (s === "capsolver") {
    if (ls.includes("capsolver.com") && (/CAP-[A-F0-9]{32,}/i.test(ls) || /accessToken[\s\S]{0,120}?eyJ[A-Za-z0-9_-]{20,}/i.test(ls))) {
      return { matched: true, evidence: "LocalStorage:dashboard.capsolver.com(accessToken)" };
    }
  }
  return { matched: false, evidence: "" };
}

/**
 * Checks whether a profile's SQLite `Cookies` or `Local Storage/leveldb` was modified within `sinceHours` (`ok 2`).
 */
function isProfileStorageModifiedWithinHours(userDataDir, sinceHours = 24, nowMs = Date.now()) {
  if (!userDataDir) return false;
  const hrs = Number(sinceHours);
  if (!Number.isFinite(hrs) || hrs <= 0) return true;
  const cutoffMs = nowMs - hrs * 3600 * 1000;
  const candidates = [
    path.join(userDataDir, "Default", "Network", "Cookies"),
    path.join(userDataDir, "Default", "Network", "Cookies-wal"),
    path.join(userDataDir, "Default", "Cookies"),
    path.join(userDataDir, "Default", "Local Storage", "leveldb"),
  ];
  for (const p of candidates) {
    try {
      const st = fs.statSync(p);
      if (st && st.mtimeMs >= cutoffMs) return true;
    } catch {
      /* ignore missing */
    }
  }
  return false;
}

function normalizeComparableEmail(raw = "") {
  const e = String(raw || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return "";
  return e.replace(/@googlemail\.com$/i, "@gmail.com");
}

function areComparableEmailsEqual(a = "", b = "") {
  const na = normalizeComparableEmail(a);
  const nb = normalizeComparableEmail(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.endsWith("@gmail.com") && nb.endsWith("@gmail.com")) {
    const la = na.slice(0, -10).replace(/\./g, "");
    const lb = nb.slice(0, -10).replace(/\./g, "");
    return Boolean(la && la === lb);
  }
  return false;
}

function isJwtCookieValueExpired(rawVal = "") {
  try {
    const decoded = decodeURIComponent(String(rawVal || "").trim());
    const jwtMatch = decoded.match(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/);
    if (!jwtMatch) return false;
    const payloadJson = Buffer.from(jwtMatch[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Number.isFinite(payload?.exp) && payload.exp <= nowSec) return true;
  } catch {
    /* ignore non-JWT or malformed payload */
  }
  return false;
}

function buildMailCookieTelemetryMetadata(cookies = [], service = "") {
  const list = Array.isArray(cookies) ? cookies.filter((c) => c && c.name) : [];
  const names = Array.from(new Set(list.map((c) => String(c.name))));
  const hasGoogleAuth = names.some((n) => ["SID", "__Secure-1PSID", "__Secure-3PSID", "LSID", "__Host-1PLSID"].includes(n));
  const hasGoogleDbsc = names.some((n) => ["__Secure-1PSIDTS", "__Secure-3PSIDTS", "SIDCC"].includes(n));
  const hasOutlookAuth = names.some((n) => ["WLSSC", "__Host-MSAAUTHP", "__Host-MSAAUTH", "RPSSecAuth", "MSPAuth", "SDIDC"].includes(n));
  return {
    cookie_count: list.length,
    has_google_auth: hasGoogleAuth,
    has_google_dbsc: hasGoogleDbsc,
    has_outlook_auth: hasOutlookAuth,
    cookie_names: names.slice(0, 14),
    service: String(service || "").trim() || null,
    native_cloak_ssot: true,
    checked_at: new Date().toISOString(),
  };
}

function resolveServicePasswordEcosystem(service = "") {
  const s = String(service || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(outlook|hotmail|live|msn|microsoft)$/.test(s)) return "microsoft_mail";
  if (/^(gmail|google|google one|goole one|youtube|gemini|google cloud)$/.test(s)) return "google_sso";
  return `standalone:${s}`;
}

function canPropagatePasswordBetweenServices(sourceService = "", targetService = "") {
  const srcEco = resolveServicePasswordEcosystem(sourceService);
  const dstEco = resolveServicePasswordEcosystem(targetService);
  if (srcEco === "unknown" || dstEco === "unknown") return false;
  return srcEco === dstEco;
}

module.exports = {
  onStealthLiveSyncEvent,
  emitStealthLiveSyncEvent,
  P0002_VAULT_DIR_CANDIDATES,
  resolveP0002VaultDir,
  NON_WEB_STATIC_SERVICES,
  GOOGLE_AUTH_SAVE_COOKIE_NAMES,
  isGoogleAuthSaveCookie,
  SERVICE_COOKIE_MATCHERS,
  isAnonymousOrTrackingCookieName,
  isSyntheticOrUnauthenticatedCookieValue,
  resolveServiceMatcher,
  readProfileSpaStorageSummary,
  matchServiceSpaStorage,
  isProfileStorageModifiedWithinHours,
  normalizeComparableEmail,
  areComparableEmailsEqual,
  isJwtCookieValueExpired,
  buildMailCookieTelemetryMetadata,
  resolveServicePasswordEcosystem,
  canPropagatePasswordBetweenServices,
};
