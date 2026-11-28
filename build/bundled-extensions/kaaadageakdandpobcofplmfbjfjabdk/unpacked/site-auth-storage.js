import {
  isSpaStorageAuthDomain,
  siteUrlForDomain,
  tabMatchesRoute,
} from "./domain-routes.js";

const SCRIPT_TIMEOUT_MS = 6000;

function withTimeout(promise, ms, fallback = null) {
  let timer = null;
  const guarded = Promise.resolve(promise).catch(() => fallback);
  return Promise.race([
    guarded.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export function hasNonEmptyAuthStorage(storage) {
  if (!storage || typeof storage !== "object") return false;
  const lsCount =
    storage.localStorage && typeof storage.localStorage === "object"
      ? Object.keys(storage.localStorage).length
      : 0;
  const ssCount =
    storage.sessionStorage && typeof storage.sessionStorage === "object"
      ? Object.keys(storage.sessionStorage).length
      : 0;
  const fbCount = Array.isArray(storage.indexedDB?.firebaseLocalStorage)
    ? storage.indexedDB.firebaseLocalStorage.length
    : 0;
  return lsCount > 0 || ssCount > 0 || fbCount > 0;
}

export function countAuthStorageItems(storage) {
  if (!storage || typeof storage !== "object") return 0;
  const lsCount =
    storage.localStorage && typeof storage.localStorage === "object"
      ? Object.keys(storage.localStorage).length
      : 0;
  const ssCount =
    storage.sessionStorage && typeof storage.sessionStorage === "object"
      ? Object.keys(storage.sessionStorage).length
      : 0;
  const fbCount = Array.isArray(storage.indexedDB?.firebaseLocalStorage)
    ? storage.indexedDB.firebaseLocalStorage.length
    : 0;
  return lsCount + ssCount + fbCount;
}

/**
 * Extract authenticated email / UID / provider summary from SPA Auth Storage (`firebaseLocalStorageDb` or `localStorage`).
 */
export function extractAuthStorageIdentity(storage) {
  const storageCount = countAuthStorageItems(storage);
  if (!storage || typeof storage !== "object" || storageCount === 0) {
    return {
      email: "",
      uid: "",
      provider: "",
      storageCount: 0,
      hasFirebase: false,
      isAuthenticated: false,
    };
  }
  const fbRecords = Array.isArray(storage?.indexedDB?.firebaseLocalStorage)
    ? storage.indexedDB.firebaseLocalStorage
    : [];
  for (const rec of fbRecords) {
    const val = rec?.value;
    if (!val || typeof val !== "object") continue;
    const hasToken = Boolean(
      val.stsTokenManager?.refreshToken || val.stsTokenManager?.accessToken || val.uid,
    );
    if (hasToken) {
      return {
        email: String(val.email || "").trim(),
        uid: String(val.uid || "").trim(),
        provider: "firebase",
        storageCount,
        hasFirebase: true,
        isAuthenticated: true,
      };
    }
  }
  for (const [k, v] of Object.entries(storage?.localStorage ?? {})) {
    if (k.startsWith("firebase:authUser:") && typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object" && (parsed.uid || parsed.stsTokenManager?.refreshToken)) {
          return {
            email: String(parsed.email || "").trim(),
            uid: String(parsed.uid || "").trim(),
            provider: "firebase",
            storageCount,
            hasFirebase: true,
            isAuthenticated: true,
          };
        }
      } catch {
        /* ignore */
      }
    }
    if (/^sb-.*-auth-token$/i.test(k) && typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        const user = parsed?.user || parsed?.currentSession?.user;
        if (user?.email || user?.id) {
          return {
            email: String(user.email || "").trim(),
            uid: String(user.id || "").trim(),
            provider: "supabase",
            storageCount,
            hasFirebase: false,
            isAuthenticated: true,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return {
    email: "",
    uid: "",
    provider: "spa",
    storageCount,
    hasFirebase: false,
    isAuthenticated: false,
  };
}

/**
 * Proposal 1 Guard: True when an ElevenLabs tab/jar holds a real signed-in session
 * (`firebaseLocalStorage` with `refreshToken`/`accessToken` or `fern_token` cookie), not just marketing `_ga` cookies.
 */
export function hasElevenLabsAuthSession(cookies = [], storage = null) {
  const id = extractAuthStorageIdentity(storage);
  if (id.hasFirebase) return true;
  const names = new Set(
    (Array.isArray(cookies) ? cookies : []).map((c) => String(c?.name ?? "").trim()),
  );
  return names.has("fern_token") || names.has("__session");
}

export function summarizeAuthStorageLines(storage, maskValue = (v) => v) {
  if (!hasNonEmptyAuthStorage(storage)) return [];
  const lines = [];
  const fbRecords = Array.isArray(storage?.indexedDB?.firebaseLocalStorage)
    ? storage.indexedDB.firebaseLocalStorage
    : [];
  for (const rec of fbRecords) {
    const val = rec?.value;
    if (!val || typeof val !== "object") continue;
    const identity = val.email || val.uid || "authenticated";
    const rt = val.stsTokenManager?.refreshToken || val.stsTokenManager?.accessToken || "";
    lines.push(`[IDB] firebase:authUser = ${identity} (${maskValue(String(rt))})`);
  }
  for (const [k, v] of Object.entries(storage?.localStorage ?? {})) {
    lines.push(`[LS] ${k} = ${maskValue(String(v ?? ""))}`);
  }
  for (const [k, v] of Object.entries(storage?.sessionStorage ?? {})) {
    lines.push(`[SS] ${k} = ${maskValue(String(v ?? ""))}`);
  }
  return lines;
}

async function waitForTabReady(tabId, timeoutMs = 4500) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.status === "complete") return;
  } catch {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  await new Promise((r) => setTimeout(r, 250));
}

export async function captureSiteAuthStorageFromTab(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return null;
  const execPromise = chrome.scripting
    .executeScript({
      target: { tabId },
      func: async () => {
        const NOISE_KEY_RE =
          /^(?:ph_phc_|_ga|_gid|_gat|_gcl|_fbp|_fbc|_ttp|_uet|_clck|_clsk|amplitude|sentry|intercom|g2tracking|lastExternalReferrer|ally-supports-cache|debug|loglevel|__vercel|next-router)/i;
        const AUTH_KEY_RE =
          /(?:firebase:|xi-|xi:|og::shared_state|flow-|sb-.*-auth-token|auth|token|session|user|clerk|supabase|cognito|amplify|adobe|ims|rw_user|cap-|dc[1-5]_|account|workspace|jwt|credential)/i;
        const MAX_VAL_LEN = 48_000;

        const collectWebStorage = (store) => {
          const out = {};
          if (!store) return out;
          try {
            for (let i = 0; i < store.length; i += 1) {
              const key = store.key(i);
              if (!key || NOISE_KEY_RE.test(key)) continue;
              const val = store.getItem(key);
              if (typeof val !== "string" || !val || val.length > MAX_VAL_LEN) continue;
              if (AUTH_KEY_RE.test(key) || AUTH_KEY_RE.test(val) || val.length <= 4096) {
                out[key] = val;
              }
            }
          } catch {
            /* ignore */
          }
          return out;
        };

        const localStorageData = collectWebStorage(window.localStorage);
        const sessionStorageData = collectWebStorage(window.sessionStorage);

        const readFirebaseIdb = () =>
          new Promise((resolve) => {
            if (typeof indexedDB === "undefined" || !indexedDB?.open) {
              resolve([]);
              return;
            }
            const timer = setTimeout(() => resolve([]), 2500);
            const finish = (rows) => {
              clearTimeout(timer);
              resolve(Array.isArray(rows) ? rows : []);
            };
            try {
              const req = indexedDB.open("firebaseLocalStorageDb");
              req.onupgradeneeded = () => {
                // DB did not exist prior to open; abort so we do not create an empty DB on non-Firebase sites.
                try {
                  req.transaction?.abort();
                } catch {
                  /* ignore */
                }
                finish([]);
              };
              req.onerror = () => finish([]);
              req.onblocked = () => finish([]);
              req.onsuccess = () => {
                const db = req.result;
                try {
                  if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
                    db.close();
                    finish([]);
                    return;
                  }
                  const tx = db.transaction("firebaseLocalStorage", "readonly");
                  const store = tx.objectStore("firebaseLocalStorage");
                  const getAllReq = store.getAll();
                  getAllReq.onsuccess = () => {
                    const list = Array.isArray(getAllReq.result) ? getAllReq.result : [];
                    db.close();
                    finish(
                      list.filter(
                        (item) =>
                          item &&
                          typeof item === "object" &&
                          typeof item.fbase_key === "string" &&
                          item.value != null,
                      ),
                    );
                  };
                  getAllReq.onerror = () => {
                    db.close();
                    finish([]);
                  };
                } catch {
                  try {
                    db.close();
                  } catch {
                    /* ignore */
                  }
                  finish([]);
                }
              };
            } catch {
              finish([]);
            }
          });

        const firebaseLocalStorage = await readFirebaseIdb();

        // Fallback: if localStorage holds firebase:authUser:* directly, ensure it's also represented in firebaseLocalStorage
        if (firebaseLocalStorage.length === 0) {
          for (const [k, v] of Object.entries(localStorageData)) {
            if (k.startsWith("firebase:authUser:")) {
              try {
                const parsed = JSON.parse(v);
                if (parsed && typeof parsed === "object") {
                  firebaseLocalStorage.push({ fbase_key: k, value: parsed });
                }
              } catch {
                /* ignore */
              }
            }
          }
        }

        const hasData =
          Object.keys(localStorageData).length > 0 ||
          Object.keys(sessionStorageData).length > 0 ||
          firebaseLocalStorage.length > 0;
        if (!hasData) return null;

        return {
          origin: location.origin,
          capturedAt: new Date().toISOString(),
          localStorage: localStorageData,
          sessionStorage: sessionStorageData,
          indexedDB: firebaseLocalStorage.length > 0 ? { firebaseLocalStorage } : undefined,
        };
      },
    })
    .then((results) => results?.[0]?.result ?? null)
    .catch(() => null);

  return withTimeout(execPromise, SCRIPT_TIMEOUT_MS, null);
}

export async function captureSiteAuthStorageForDomain(domain, opts = {}) {
  const cleanDomain = String(domain ?? "").trim();
  if (!cleanDomain || !chrome.tabs?.query) return null;

  const tabs = await chrome.tabs.query({}).catch(() => []);
  const matching = tabs
    .filter((t) => t?.id && t?.url && tabMatchesRoute(t.url, cleanDomain))
    .sort((a, b) => {
      const aSignIn = /\/(sign-in|sign-up|login)\b/i.test(a.url || "") ? 1 : 0;
      const bSignIn = /\/(sign-in|sign-up|login)\b/i.test(b.url || "") ? 1 : 0;
      if (aSignIn !== bSignIn) return aSignIn - bSignIn;
      return (b.active ? 1 : 0) - (a.active ? 1 : 0);
    });

  let bestStorage = null;
  for (const tab of matching) {
    const captured = await captureSiteAuthStorageFromTab(tab.id);
    if (hasNonEmptyAuthStorage(captured)) {
      if (Array.isArray(captured?.indexedDB?.firebaseLocalStorage) && captured.indexedDB.firebaseLocalStorage.length > 0) {
        return captured;
      }
      if (!bestStorage) bestStorage = captured;
    }
  }
  if (bestStorage) return bestStorage;

  const shouldEnsureTab =
    opts.ensureTabIfMissing === true ||
    (opts.ensureTabIfMissing !== false && isSpaStorageAuthDomain(cleanDomain));
  if (!shouldEnsureTab || !chrome.tabs?.create) return null;

  let tempTab = null;
  try {
    tempTab = await chrome.tabs.create({
      url: siteUrlForDomain(cleanDomain),
      active: false,
    });
    if (!tempTab?.id) return null;
    await waitForTabReady(tempTab.id, 4500);
    const captured = await captureSiteAuthStorageFromTab(tempTab.id);
    return hasNonEmptyAuthStorage(captured) ? captured : null;
  } catch {
    return null;
  } finally {
    if (tempTab?.id) {
      await chrome.tabs.remove(tempTab.id).catch(() => null);
    }
  }
}

export async function applySiteAuthStorageToTab(tabId, storage) {
  if (!tabId || !hasNonEmptyAuthStorage(storage) || !chrome.scripting?.executeScript) {
    return { ok: false, applied: 0 };
  }
  const execPromise = chrome.scripting
    .executeScript({
      target: { tabId },
      args: [storage],
      func: async (incoming) => {
        if (!incoming || typeof incoming !== "object") return { ok: false, applied: 0 };
        let applied = 0;

        const fbList = Array.isArray(incoming.indexedDB?.firebaseLocalStorage)
          ? incoming.indexedDB.firebaseLocalStorage
          : [];

        // Refresh Firebase stsTokenManager.accessToken using refreshToken so expired vaults still log in immediately
        const refreshedFbList = [];
        for (const rawRec of fbList) {
          if (!rawRec || typeof rawRec !== "object" || !rawRec.fbase_key || !rawRec.value) continue;
          const rec = JSON.parse(JSON.stringify(rawRec));
          const apiKey = rec.value?.apiKey;
          const refreshToken = rec.value?.stsTokenManager?.refreshToken;
          if (apiKey && refreshToken) {
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 3500);
              const res = await fetch(
                `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                  }),
                  signal: ctrl.signal,
                },
              ).finally(() => clearTimeout(timer));
              if (res.ok) {
                const tokenData = await res.json();
                if (tokenData?.id_token || tokenData?.access_token) {
                  rec.value.stsTokenManager = {
                    ...rec.value.stsTokenManager,
                    accessToken: tokenData.id_token || tokenData.access_token,
                    refreshToken: tokenData.refresh_token || refreshToken,
                    expirationTime: Date.now() + Number(tokenData.expires_in || 3600) * 1000,
                  };
                }
              }
            } catch {
              /* keep existing accessToken if offline or blocked */
            }
          }
          refreshedFbList.push(rec);
        }

        try {
          if (incoming.localStorage && typeof incoming.localStorage === "object") {
            for (const [k, v] of Object.entries(incoming.localStorage)) {
              if (typeof k === "string" && typeof v === "string") {
                window.localStorage.setItem(k, v);
                applied += 1;
              }
            }
          }
          for (const rec of refreshedFbList) {
            if (typeof rec.fbase_key === "string" && rec.value != null) {
              window.localStorage.setItem(rec.fbase_key, JSON.stringify(rec.value));
            }
          }
        } catch {
          /* ignore */
        }

        try {
          if (incoming.sessionStorage && typeof incoming.sessionStorage === "object") {
            for (const [k, v] of Object.entries(incoming.sessionStorage)) {
              if (typeof k === "string" && typeof v === "string") {
                window.sessionStorage.setItem(k, v);
                applied += 1;
              }
            }
          }
        } catch {
          /* ignore */
        }

        if (refreshedFbList.length > 0 && typeof indexedDB !== "undefined" && indexedDB?.open) {
          const writeFirebaseIdb = () =>
            new Promise((resolve) => {
              const timer = setTimeout(() => resolve(0), 3500);
              const finish = (n) => {
                clearTimeout(timer);
                resolve(n);
              };

              const putRecords = (db) => {
                try {
                  const tx = db.transaction("firebaseLocalStorage", "readwrite");
                  const store = tx.objectStore("firebaseLocalStorage");
                  try {
                    store.clear();
                  } catch {
                    /* ignore */
                  }
                  for (const rec of refreshedFbList) {
                    store.put(rec);
                  }
                  tx.oncomplete = () => {
                    db.close();
                    finish(refreshedFbList.length);
                  };
                  tx.onerror = () => {
                    db.close();
                    finish(0);
                  };
                } catch {
                  try {
                    db.close();
                  } catch {
                    /* ignore */
                  }
                  finish(0);
                }
              };

              try {
                const req = indexedDB.open("firebaseLocalStorageDb");
                req.onupgradeneeded = () => {
                  const db = req.result;
                  if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
                    db.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
                  }
                };
                req.onerror = () => finish(0);
                req.onblocked = () => finish(0);
                req.onsuccess = () => {
                  const db = req.result;
                  if (db.objectStoreNames.contains("firebaseLocalStorage")) {
                    putRecords(db);
                    return;
                  }
                  const nextVer = (Number(db.version) || 1) + 1;
                  db.close();
                  const upReq = indexedDB.open("firebaseLocalStorageDb", nextVer);
                  upReq.onupgradeneeded = () => {
                    const upDb = upReq.result;
                    if (!upDb.objectStoreNames.contains("firebaseLocalStorage")) {
                      upDb.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
                    }
                  };
                  upReq.onsuccess = () => putRecords(upReq.result);
                  upReq.onerror = () => finish(0);
                  upReq.onblocked = () => finish(0);
                };
              } catch {
                finish(0);
              }
            });

          const idbWritten = await writeFirebaseIdb();
          applied += idbWritten;
        }

        return { ok: applied > 0, applied, firebaseRecords: refreshedFbList.length };
      },
    })
    .then((results) => results?.[0]?.result ?? { ok: false, applied: 0 })
    .catch(() => ({ ok: false, applied: 0 }));

  return withTimeout(execPromise, SCRIPT_TIMEOUT_MS, { ok: false, applied: 0 });
}

export async function applySiteAuthStorageForDomain(domain, storage) {
  const cleanDomain = String(domain ?? "").trim();
  if (!cleanDomain || !hasNonEmptyAuthStorage(storage) || !chrome.tabs?.query) {
    return { ok: false, applied: 0, tabs: 0 };
  }
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const matching = tabs.filter((t) => t?.id && t?.url && tabMatchesRoute(t.url, cleanDomain));
  let totalApplied = 0;
  let updatedTabs = 0;
  for (const tab of matching) {
    const res = await applySiteAuthStorageToTab(tab.id, storage);
    if (res?.ok) {
      totalApplied = Math.max(totalApplied, res.applied ?? 0);
      updatedTabs += 1;
    }
  }
  return { ok: totalApplied > 0, applied: totalApplied, tabs: updatedTabs };
}
