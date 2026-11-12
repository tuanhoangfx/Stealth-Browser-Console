const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { markProfileChromeCleanExit } = require("./profile-chrome-session.cjs");
const {
  buildProfileBrowserPidsPs,
  buildFocusProfileWindowPs,
  escapePsSingleQuoted,
} = require("./chrome-process-query.cjs");
const { runPowerShellCommandAsync } = require("./powershell-exec.cjs");

const execFileAsync = promisify(execFile);

const CHROME_NAMES = new Set(["chrome.exe", "chrome-headless.exe", "chromium.exe"]);
const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile", "SingletonSocket", "SingletonBadge"];
const PID_LIST_CACHE_MS = 2000;
/** @type {Map<string, { pids: number[], at: number }>} */
const pidListCache = new Map();

let orphanNativeApi = null;
let orphanNativeInitTried = false;

function getOrphanNativeApi() {
  if (process.platform !== "win32") return null;
  if (globalThis.__STEALTH_ORPHAN_NATIVE_API__) return globalThis.__STEALTH_ORPHAN_NATIVE_API__;
  if (orphanNativeInitTried) return orphanNativeApi;
  orphanNativeInitTried = true;
  const candidates = [
    "koffi",
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "koffi") : "",
    path.resolve(__dirname, "..", "..", "node_modules", "koffi"),
    path.resolve(__dirname, "..", "..", "..", "P0001-Desk-Console", "node_modules", "koffi"),
    "E:/Dev/Tool/P0001-Desk-Console/node_modules/koffi",
    "E:/Dev/Tool/P0003-Stealth-Browser-Console/node_modules/koffi",
    "E:/Dev/node_modules/koffi",
    "E:/Dev/node_modules/.pnpm/koffi@3.1.6/node_modules/koffi",
  ].filter(Boolean);
  for (const cand of candidates) {
    try {
      const koffi = require(cand);
      const kernel32 = koffi.load("kernel32.dll");
      const ntdll = koffi.load("ntdll.dll");
      const suffix = `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const peName = `PROCESSENTRY32W_ORPHAN${suffix}`;
      const PROCESSENTRY32W = koffi.struct(peName, {
        dwSize: "uint32_t",
        cntUsage: "uint32_t",
        th32ProcessID: "uint32_t",
        th32DefaultHeapID: "uintptr_t",
        th32ModuleID: "uint32_t",
        cntThreads: "uint32_t",
        th32ParentProcessID: "uint32_t",
        pcPriClassBase: "int32_t",
        dwFlags: "uint32_t",
        szExeFile: koffi.array("uint16_t", 260),
      });
      orphanNativeApi = {
        koffi,
        peSize: koffi.sizeof(PROCESSENTRY32W),
        CreateToolhelp32Snapshot: kernel32.func("void* __stdcall CreateToolhelp32Snapshot(uint32_t, uint32_t)"),
        Process32FirstW: kernel32.func(`bool __stdcall Process32FirstW(void*, _Inout_ ${peName}*)`),
        Process32NextW: kernel32.func(`bool __stdcall Process32NextW(void*, _Inout_ ${peName}*)`),
        OpenProcess: kernel32.func("void* __stdcall OpenProcess(uint32_t, bool, uint32_t)"),
        TerminateProcess: kernel32.func("bool __stdcall TerminateProcess(void*, uint32_t)"),
        SetPriorityClass: kernel32.func("bool __stdcall SetPriorityClass(void*, uint32_t)"),
        GetProcessTimes: kernel32.func("bool __stdcall GetProcessTimes(void*, void*, void*, void*, void*)"),
        CloseHandle: kernel32.func("bool __stdcall CloseHandle(void*)"),
        NtQueryInformationProcess: ntdll.func("int __stdcall NtQueryInformationProcess(void*, int, void*, uint32_t, uint32_t*)"),
      };
      globalThis.__STEALTH_ORPHAN_NATIVE_API__ = orphanNativeApi;
      break;
    } catch {
      /* try next */
    }
  }
  return orphanNativeApi;
}

let orphanUser32Api = null;
let orphanUser32InitTried = false;

function getOrphanUser32Api() {
  if (process.platform !== "win32") return null;
  if (globalThis.__STEALTH_ORPHAN_USER32_API__) return globalThis.__STEALTH_ORPHAN_USER32_API__;
  if (orphanUser32InitTried) return orphanUser32Api;
  orphanUser32InitTried = true;
  const baseApi = getOrphanNativeApi();
  const koffi = baseApi?.koffi || null;
  if (!koffi) return null;
  try {
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const suffix = `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const rectName = `RECT_ORPHAN${suffix}`;
    const enumProtoName = `EnumDesktopWindowsProc_ORPHAN${suffix}`;
    koffi.struct(rectName, {
      Left: "int32_t",
      Top: "int32_t",
      Right: "int32_t",
      Bottom: "int32_t",
    });
    const EnumDesktopWindowsProc = koffi.proto(
      `bool __stdcall ${enumProtoName}(uintptr_t, uintptr_t)`,
    );
    let activeVisitor = null;
    const sharedEnumCallback = koffi.register((hwnd) => {
      if (typeof activeVisitor === "function") {
        return activeVisitor(hwnd) !== false;
      }
      return false;
    }, koffi.pointer(EnumDesktopWindowsProc));
    const EnumDesktopWindowsRaw = user32.func(
      `bool __stdcall EnumDesktopWindows(uintptr_t, ${enumProtoName}*, uintptr_t)`,
    );
    const enumDesktopWindowsWithVisitor = (hDesktop, visitor) => {
      if (activeVisitor === null) {
        activeVisitor = visitor;
        try {
          return EnumDesktopWindowsRaw(hDesktop || 0, sharedEnumCallback, 0);
        } finally {
          activeVisitor = null;
        }
      }
      const tempCb = koffi.register(
        (hwnd) => visitor(hwnd) !== false,
        koffi.pointer(EnumDesktopWindowsProc),
      );
      try {
        return EnumDesktopWindowsRaw(hDesktop || 0, tempCb, 0);
      } finally {
        koffi.unregister(tempCb);
      }
    };
    orphanUser32Api = {
      enumDesktopWindowsWithVisitor,
      OpenInputDesktop: user32.func("uintptr_t __stdcall OpenInputDesktop(uint32_t, bool, uint32_t)"),
      CloseDesktop: user32.func("bool __stdcall CloseDesktop(uintptr_t)"),
      IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(uintptr_t)"),
      IsIconic: user32.func("bool __stdcall IsIconic(uintptr_t)"),
      IsZoomed: user32.func("bool __stdcall IsZoomed(uintptr_t)"),
      GetWindow: user32.func("uintptr_t __stdcall GetWindow(uintptr_t, uint32_t)"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(uintptr_t, _Out_ uint32_t*)"),
      GetClassNameW: user32.func("int __stdcall GetClassNameW(uintptr_t, void*, int)"),
      GetWindowRect: user32.func(`bool __stdcall GetWindowRect(uintptr_t, _Out_ ${rectName}*)`),
      MoveWindow: user32.func("bool __stdcall MoveWindow(uintptr_t, int, int, int, int, bool)"),
      ShowWindow: user32.func("bool __stdcall ShowWindow(uintptr_t, int)"),
      BringWindowToTop: user32.func("bool __stdcall BringWindowToTop(uintptr_t)"),
      SetForegroundWindow: user32.func("bool __stdcall SetForegroundWindow(uintptr_t)"),
      GetForegroundWindow: user32.func("uintptr_t __stdcall GetForegroundWindow()"),
      AttachThreadInput: user32.func("bool __stdcall AttachThreadInput(uint32_t, uint32_t, bool)"),
      GetCurrentThreadId: kernel32.func("uint32_t __stdcall GetCurrentThreadId()"),
    };
    globalThis.__STEALTH_ORPHAN_USER32_API__ = orphanUser32Api;
  } catch {
    orphanUser32Api = null;
  }
  return orphanUser32Api;
}

/**
 * Find the visible, unowned top-level main HWND belonging to any PID in `pids` in <1ms via user32.dll
 * (0 PowerShell spawns, 0 WMI/C# compilation). Prefers `Chrome_WidgetWin_1` when present.
 */
function findMainWindowForPidsNative(pids) {
  const u32 = getOrphanUser32Api();
  if (!u32 || !pids) return 0;
  const pidSet = new Set();
  for (const p of pids) {
    const n = Number(p);
    if (Number.isInteger(n) && n > 0) pidSet.add(n);
  }
  if (pidSet.size === 0) return 0;

  const pidOut = [0];
  const clsBuf = Buffer.alloc(512);
  let preferredHwnd = 0;
  let fallbackHwnd = 0;
  let visitedAny = false;

  const visitor = (hwnd) => {
    visitedAny = true;
    if (!hwnd) return true;
    u32.GetWindowThreadProcessId(hwnd, pidOut);
    if (!pidSet.has(pidOut[0])) return true;
    if (!u32.IsWindowVisible(hwnd)) return true;
    if (u32.GetWindow(hwnd, 4)) return true; // GW_OWNER === 4 (must be unowned top-level window)
    const nChars = u32.GetClassNameW(hwnd, clsBuf, 256);
    const cls = nChars > 0 ? clsBuf.subarray(0, nChars * 2).toString("utf16le") : "";
    if (cls === "Chrome_WidgetWin_1") {
      preferredHwnd = hwnd;
      return false;
    }
    if (!fallbackHwnd) fallbackHwnd = hwnd;
    return true;
  };

  u32.enumDesktopWindowsWithVisitor(0, visitor);
  if (preferredHwnd) return preferredHwnd;
  if (!visitedAny || !fallbackHwnd) {
    const hInput = u32.OpenInputDesktop(0, false, 0x0041); // DESKTOP_READOBJECTS | DESKTOP_ENUMERATE
    if (hInput) {
      try {
        u32.enumDesktopWindowsWithVisitor(hInput, visitor);
      } finally {
        u32.CloseDesktop(hInput);
      }
    }
  }
  return preferredHwnd || fallbackHwnd || 0;
}

function hasMainWindowForPidNative(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return false;
  return Boolean(findMainWindowForPidsNative([id]));
}

function isPidAliveFast(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

const NATIVE_SCAN_CACHE_TTL_MS = 4000;
let _nativeChromeScanCache = { at: 0, rows: null };
const _healedSidecarByPid = new Map();

function healSidecarPidsFromScanRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const now = Date.now();
  for (const r of rows) {
    const pid = Number(r?.pid) || 0;
    const cmd = String(r?.cmdLower || "");
    if (!(pid > 0) || !cmd || cmd.includes("--type=")) continue;
    if (now - (_healedSidecarByPid.get(pid) || 0) < 60_000) continue;
    const m = cmd.match(/--user-data-dir=(?:"([^"]+)"|([^\s"]+))/i);
    const udir = m ? (m[1] || m[2] || "").trim() : "";
    if (!udir || !udir.includes("profiles")) continue;
    _healedSidecarByPid.set(pid, now);
    try {
      const sidecarFile = path.join(path.resolve(udir), "stealth-pid.json");
      let prev = null;
      if (fs.existsSync(sidecarFile)) {
        try {
          prev = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
        } catch {
          prev = null;
        }
      }
      const isHeadless = cmd.includes("--headless");
      if (!prev || Number(prev.pid) !== pid || prev.headless !== isHeadless) {
        const portMatch = cmd.match(/--remote-debugging-port=(\d+)/i);
        const debugPort = portMatch ? Number(portMatch[1]) || 0 : Number(prev?.debugPort) || 0;
        fs.writeFileSync(
          sidecarFile,
          JSON.stringify({
            pid,
            debugPort,
            launchedAt: Number(prev?.launchedAt) || now,
            headless: isHeadless,
          }),
        );
      }
    } catch {
      /* ignore */
    }
  }
}

function scanChromeProcessesNative({ forceFresh = false } = {}) {
  const now = Date.now();
  if (!forceFresh && _nativeChromeScanCache.rows && now - _nativeChromeScanCache.at < NATIVE_SCAN_CACHE_TTL_MS) {
    return _nativeChromeScanCache.rows;
  }
  const api = getOrphanNativeApi();
  if (!api) return null;
  const snap = api.CreateToolhelp32Snapshot(0x00000002, 0);
  if (!snap) return null;
  const rows = [];
  const pe = { dwSize: api.peSize };
  const buf = Buffer.alloc(16384);
  const retLen = [0];
  try {
    if (api.Process32FirstW(snap, pe)) {
      do {
        let end = 0;
        while (end < 260 && pe.szExeFile[end] !== 0) end++;
        const name = String.fromCharCode(...pe.szExeFile.subarray(0, end)).toLowerCase();
        if (CHROME_NAMES.has(name)) {
          const pid = Number(pe.th32ProcessID);
          const ppid = Number(pe.th32ParentProcessID);
          let cmd = "";
          let cmdLower = "";
          const h = api.OpenProcess(0x1000, false, pid);
          if (h) {
            try {
              if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
                const len = buf.readUInt16LE(0);
                if (len > 0 && 16 + len <= buf.length) {
                  cmd = buf.subarray(16, 16 + len).toString("utf16le");
                  cmdLower = cmd.toLowerCase();
                }
              }
            } catch {
              /* ignore */
            } finally {
              api.CloseHandle(h);
            }
          }
          if (cmdLower) rows.push({ pid, ppid, cmd, cmdLower });
        }
      } while (api.Process32NextW(snap, pe));
    }
    _nativeChromeScanCache = { at: Date.now(), rows };
    healSidecarPidsFromScanRows(rows);
    return rows;
  } finally {
    api.CloseHandle(snap);
  }
}

const NEVER_TERMINATE_EXE_NAMES = new Set([
  "antigravity.exe",
  "antigravity ide.exe",
  "language_server_windows_x64.exe",
  "language_server.exe",
  "cursor.exe",
  "code.exe",
  "explorer.exe",
  "wmiprvse.exe",
  "stealth browser console.exe",
  "desk console.exe",
  "video lab.exe",
  "video-lab-worker.exe",
  "auto livestream 24-7.exe",
  "zalo.exe",
  "svchost.exe",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "services.exe",
  "lsass.exe",
]);

function terminateProcessTreeNative(rootPids) {
  const api = getOrphanNativeApi();
  if (!api || !rootPids || rootPids.length === 0) return null;
  const snap = api.CreateToolhelp32Snapshot(0x00000002, 0);
  if (!snap) return null;
  const parentByPid = new Map();
  const protectedPids = new Set([process.pid, process.ppid]);
  const pe = { dwSize: api.peSize };
  try {
    if (api.Process32FirstW(snap, pe)) {
      do {
        const pid = Number(pe.th32ProcessID);
        const ppid = Number(pe.th32ParentProcessID);
        parentByPid.set(pid, ppid);
        let end = 0;
        while (end < 260 && pe.szExeFile[end] !== 0) end++;
        const name = String.fromCharCode(...pe.szExeFile.subarray(0, end)).toLowerCase();
        if (NEVER_TERMINATE_EXE_NAMES.has(name)) {
          protectedPids.add(pid);
        }
      } while (api.Process32NextW(snap, pe));
    }
  } finally {
    api.CloseHandle(snap);
  }
  const targetPids = new Set(
    rootPids
      .map(Number)
      .filter((n) => n > 0 && !protectedPids.has(n)),
  );
  if (targetPids.size === 0) return 0;
  let added = true;
  while (added) {
    added = false;
    for (const [childPid, ppid] of parentByPid.entries()) {
      if (
        !targetPids.has(childPid) &&
        !protectedPids.has(childPid) &&
        targetPids.has(ppid)
      ) {
        targetPids.add(childPid);
        added = true;
      }
    }
  }
  let killed = 0;
  for (const pid of targetPids) {
    if (protectedPids.has(pid)) continue;
    const h = api.OpenProcess(0x0001, false, pid);
    if (h) {
      try {
        if (api.TerminateProcess(h, 1)) killed++;
      } finally {
        api.CloseHandle(h);
      }
    }
  }
  return killed;
}

const VITE_PORT_TO_PRODUCT_DIR = {
  5180: "E:\\Dev\\Tool\\P0001-Desk-Console",
  3001: "E:\\Dev\\Tool\\P0001-Desk-Console",
  3002: "E:\\Dev\\Tool\\P0002-Social-Hub",
  5175: "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console",
  5176: "E:\\Dev\\Tool\\P0004-Tool-Hub",
  3005: "E:\\Dev\\Tool\\P0005-CRM",
  3029: "E:\\Dev\\Tool\\P0006-Video-Lab",
  8029: "E:\\Dev\\Tool\\P0006-Video-Lab",
  3008: "E:\\Dev\\Tool\\P0008-Landing-Platform",
  5174: "E:\\Dev\\Tool\\P0009-Auto-Livestream",
  3011: "E:\\Dev\\Tool\\P0011-Infix1-Mail",
  8787: "E:\\Dev\\Tool\\P0011-Infix1-Mail",
  3012: "E:\\Dev\\Tool\\P0012-Performance",
  3014: "E:\\Dev\\Tool\\P0014-Hair-Landing-SSOT",
  3026: "E:\\Dev\\Tool\\P0015-Enzy-Portal",
  5186: "E:\\Dev\\Tool\\P0016-ChatCenter",
  5177: "E:\\Dev\\Tool\\P0020-Data-Box",
  3022: "E:\\Dev\\Tool\\P0022-Infi-Store",
  3024: "E:\\Dev\\Tool\\P0024-Map-Places",
};

const _productActivityCache = new Map();

function getLatestProductActivityMs(productDir, now = Date.now()) {
  if (!productDir) return 0;
  const cached = _productActivityCache.get(productDir);
  if (cached && now - cached.checkedAt < 25_000) return cached.mtimeMs;
  let maxMs = 0;
  const checkFile = (fp) => {
    try {
      const st = fs.statSync(fp);
      if (st.mtimeMs > maxMs) maxMs = st.mtimeMs;
    } catch {
      /* ignore */
    }
  };
  checkFile(path.join(productDir, ".vite-active-lease.txt"));
  checkFile(path.join(productDir, "package.json"));
  checkFile(path.join(productDir, "index.html"));
  checkFile(path.join(productDir, "vite.config.ts"));
  checkFile(path.join(productDir, "vite.config.js"));
  const srcDir = path.join(productDir, "src");
  const walkShallow = (dir, depth) => {
    if (depth > 2) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        checkFile(full);
        if (ent.isDirectory() && depth < 2) {
          walkShallow(full, depth + 1);
        }
      }
    } catch {
      /* ignore */
    }
  };
  walkShallow(srcDir, 0);
  _productActivityCache.set(productDir, { checkedAt: now, mtimeMs: maxMs });
  return maxMs;
}

function getProcessCreatedEpochMs(api, hProc, ftBuf) {
  if (!api || typeof api.GetProcessTimes !== "function" || !hProc) return 0;
  try {
    const c = ftBuf.subarray(0, 8);
    const e = ftBuf.subarray(8, 16);
    const k = ftBuf.subarray(16, 24);
    const u = ftBuf.subarray(24, 32);
    c.fill(0);
    if (api.GetProcessTimes(hProc, c, e, k, u)) {
      const ticks100ns = c.readBigUInt64LE(0);
      if (ticks100ns > 116444736000000000n) {
        return Number(ticks100ns / 10000n - 11644473600000n);
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Reaps orphaned `adb.exe ... com.genymobile.scrcpy.Server` streaming processes,
 * stuck `powershell.exe` children (> 90s under IDE / console or deprecated WMI/RestartManager scans),
 * bare `node.exe` REPL processes, and idle Vite dev servers (> 30m without product edits) in <5ms via Win32 native snapshot.
 */
const ORPHAN_AUDIT_LOG_PATH = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\logs\\orphan-reaper-audit.jsonl";

function appendOrphanReaperAuditLog(entries, source = "P0003") {
  if (!Array.isArray(entries) || entries.length === 0) return;
  try {
    const dir = path.dirname(ORPHAN_AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
      const st = fs.statSync(ORPHAN_AUDIT_LOG_PATH);
      if (st.size > 2 * 1024 * 1024) {
        const buf = fs.readFileSync(ORPHAN_AUDIT_LOG_PATH);
        fs.writeFileSync(ORPHAN_AUDIT_LOG_PATH, buf.subarray(buf.length - 512 * 1024));
      }
    } catch {
      /* ignore */
    }
    const ts = new Date().toISOString();
    const lines = entries
      .map((e) => JSON.stringify({ timestamp: ts, source, ...e }))
      .join("\n") + "\n";
    fs.appendFileSync(ORPHAN_AUDIT_LOG_PATH, lines, "utf8");
  } catch {
    /* ignore audit log errors */
  }
}

function reapOrphanAdbScrcpyProcessesNative({ maxIdleMs = 90_000, viteMaxIdleMs = 30 * 60_000 } = {}) {
  const api = getOrphanNativeApi();
  if (!api) return { scanned: 0, killed: 0, pids: [] };
  const activeHubPids = new Set();
  const auditEntries = [];
  const now = Date.now();
  try {
    const rt = globalThis.__p0003AndroidH264Runtime;
    if (rt && rt.displayHubs instanceof Map) {
      const hasAllStreamClients = rt.allStreamClients instanceof Set && rt.allStreamClients.size > 0;
      const patrolRunning = Boolean(rt.farmPatrolState && rt.farmPatrolState.running);
      for (const hub of rt.displayHubs.values()) {
        if (!hub || !hub.alive || !(Number(hub.proc?.pid) > 0)) continue;
        const pid = Number(hub.proc.pid);
        const startedMs = hub.startedAt ? Date.parse(hub.startedAt) : 0;
        const hasClients = hasAllStreamClients || patrolRunning || (hub.clients instanceof Set && hub.clients.size > 0);
        const isRecent = Number.isFinite(startedMs) && now - startedMs < maxIdleMs;
        if (hasClients || isRecent) {
          activeHubPids.add(pid);
        }
      }
    }
  } catch {
    /* ignore runtime inspection errors */
  }

  const snap = api.CreateToolhelp32Snapshot(0x00000002, 0);
  if (!snap) return { scanned: 0, killed: 0, pids: [] };
  const orphanPids = [];
  const p0006IdleWorkerCandidates = [];
  let hasActiveVideoLabApp = false;
  let scanned = 0;
  const pe = { dwSize: api.peSize };
  const buf = Buffer.alloc(16384);
  const ftBuf = Buffer.alloc(32);
  const retLen = [0];
  try {
    if (api.Process32FirstW(snap, pe)) {
      do {
        let end = 0;
        while (end < 260 && pe.szExeFile[end] !== 0) end++;
        const name = String.fromCharCode(...pe.szExeFile.subarray(0, end)).toLowerCase();
        if (name === "adb.exe") {
          const pid = Number(pe.th32ProcessID);
          if (activeHubPids.has(pid)) continue;
          let cmdLower = "";
          const h = api.OpenProcess(0x1000, false, pid);
          if (h) {
            try {
              if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
                const len = buf.readUInt16LE(0);
                if (len > 0 && 16 + len <= buf.length) {
                  cmdLower = buf.subarray(16, 16 + len).toString("utf16le").toLowerCase();
                }
              }
            } catch {
              /* ignore */
            } finally {
              api.CloseHandle(h);
            }
          }
          if (cmdLower.includes("com.genymobile.scrcpy.server") || cmdLower.includes("scrcpy-server")) {
            scanned++;
            orphanPids.push(pid);
          }
        } else if (name === "chrome-headless-shell.exe" || name === "chrome-headless.exe") {
          const pid = Number(pe.th32ProcessID);
          const ppid = Number(pe.th32ParentProcessID);
          if (ppid > 0 && !isPidAliveFast(ppid)) {
            scanned++;
            orphanPids.push(pid);
          }
        } else if (name === "powershell.exe") {
          const pid = Number(pe.th32ProcessID);
          if (pid === process.pid || pid === process.ppid) continue;
          const ppid = Number(pe.th32ParentProcessID);
          let cmdLower = "";
          let createdMs = 0;
          const h = api.OpenProcess(0x1000, false, pid);
          if (h) {
            try {
              if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
                const len = buf.readUInt16LE(0);
                if (len > 0 && 16 + len <= buf.length) {
                  cmdLower = buf.subarray(16, 16 + len).toString("utf16le").toLowerCase().trim();
                }
              }
              createdMs = getProcessCreatedEpochMs(api, h, ftBuf);
            } catch {
              /* ignore */
            } finally {
              api.CloseHandle(h);
            }
          }
          const isDeprecatedScan =
            cmdLower.includes("stealthrestartmanager") ||
            cmdLower.includes("rstrtmgr.dll") ||
            (cmdLower.includes("get-ciminstance") && cmdLower.includes("win32_process"));
          const isStuckNonInteractive =
            createdMs > 0 &&
            now - createdMs > 90_000 &&
            cmdLower.includes("-noninteractive") &&
            !cmdLower.includes("-noexit") &&
            (ppid === process.pid || !isPidAliveFast(ppid) || cmdLower.includes("-command -"));
          if (isDeprecatedScan || isStuckNonInteractive) {
            scanned++;
            orphanPids.push(pid);
          }
        } else if (
          name === "stealth browser console.exe" ||
          name === "desk console.exe" ||
          name === "video lab.exe" ||
          name === "auto livestream 24-7.exe"
        ) {
          if (name === "video lab.exe") {
            hasActiveVideoLabApp = true;
          }
          const pid = Number(pe.th32ProcessID);
          if (typeof api.SetPriorityClass === "function") {
            const hUi = api.OpenProcess(0x0200, false, pid);
            if (hUi) {
              try {
                api.SetPriorityClass(hUi, 0x00000020); // Restore NORMAL_PRIORITY_CLASS so desktop UI is never trapped at IDLE/BELOW_NORMAL
              } catch {}
              api.CloseHandle(hUi);
            }
          }
        } else if (name === "node.exe") {
          const pid = Number(pe.th32ProcessID);
          if (pid === process.pid || pid === process.ppid) continue;
          let cmdLower = "";
          let createdMs = 0;
          const h = api.OpenProcess(0x1000 | 0x0200, false, pid);
          if (h) {
            try {
              if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
                const len = buf.readUInt16LE(0);
                if (len > 0 && 16 + len <= buf.length) {
                  cmdLower = buf.subarray(16, 16 + len).toString("utf16le").toLowerCase().trim();
                }
              }
              createdMs = getProcessCreatedEpochMs(api, h, ftBuf);
            } catch {
              /* ignore */
            } finally {
              api.CloseHandle(h);
            }
          }
          // Reap bare interactive node.exe REPL processes spawned with zero script arguments
          if (
            cmdLower &&
            /^"?[a-z]:\\[^"]*\\node\.exe"?$/i.test(cmdLower)
          ) {
            scanned++;
            orphanPids.push(pid);
            auditEntries.push({ pid, name, cmd: cmdLower, reason: "bare-node-repl" });
          } else if (
            viteMaxIdleMs > 0 &&
            (cmdLower.includes("vite/bin/vite.js") || cmdLower.includes("vite\\bin\\vite.js"))
          ) {
            const portMatch = cmdLower.match(/--port\s+(\d+)/);
            const port = portMatch ? Number(portMatch[1]) : 0;
            const productDir = VITE_PORT_TO_PRODUCT_DIR[port];
            if (productDir && createdMs > 0 && now - createdMs > viteMaxIdleMs) {
              const latestActMs = getLatestProductActivityMs(productDir, now);
              const idleMs = now - Math.max(createdMs, latestActMs);
              if (idleMs > viteMaxIdleMs) {
                scanned++;
                orphanPids.push(pid);
                auditEntries.push({
                  pid,
                  name,
                  port,
                  productDir,
                  idleMin: Math.round(idleMs / 60_000),
                  reason: "idle-vite-30m",
                });
              }
            }
          }
        } else if (viteMaxIdleMs > 0 && name === "python.exe") {
          const pid = Number(pe.th32ProcessID);
          let cmdLower = "";
          let createdMs = 0;
          const h = api.OpenProcess(0x1000, false, pid);
          if (h) {
            try {
              if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
                const len = buf.readUInt16LE(0);
                if (len > 0 && 16 + len <= buf.length) {
                  cmdLower = buf.subarray(16, 16 + len).toString("utf16le").toLowerCase().trim();
                }
              }
              createdMs = getProcessCreatedEpochMs(api, h, ftBuf);
            } catch {
              /* ignore */
            } finally {
              api.CloseHandle(h);
            }
          }
          const isP0006Worker =
            name === "python.exe" && cmdLower.includes("uvicorn") && cmdLower.includes("8029");
          if (isP0006Worker && createdMs > 0 && now - createdMs > viteMaxIdleMs) {
            const p0006Dir = "E:\\Dev\\Tool\\P0006-Video-Lab";
            const latestActMs = getLatestProductActivityMs(p0006Dir, now);
            const idleMs = now - Math.max(createdMs, latestActMs);
            if (idleMs > viteMaxIdleMs) {
              p0006IdleWorkerCandidates.push({
                pid,
                name,
                idleMin: Math.round(idleMs / 60_000),
                reason: "idle-p0006-worker-30m",
              });
            }
          }
        }
      } while (api.Process32NextW(snap, pe));
    }
  } finally {
    api.CloseHandle(snap);
  }

  if (!hasActiveVideoLabApp && p0006IdleWorkerCandidates.length > 0) {
    for (const cand of p0006IdleWorkerCandidates) {
      scanned++;
      orphanPids.push(cand.pid);
      auditEntries.push(cand);
    }
  }

  const killed = orphanPids.length > 0 ? terminateProcessTreeNative(orphanPids) || 0 : 0;
  if (killed > 0 && auditEntries.length > 0) {
    appendOrphanReaperAuditLog(auditEntries, "P0003");
  }
  return { scanned, killed, pids: orphanPids };
}

/**
 * No-op: never auto-kill user-pinned taskbar PWA Chrome instances (`--source-shortcut=... --app-id=<id>`).
 * Multiple taskbar shortcuts across different profiles (#8000/#8001/#8002/#8003/#8999) or shared profiles
 * (where Data Box and CRM share one main Chrome process) are intentional user windows and must never be terminated.
 */
function reapDuplicateTaskbarPwaProcessesNative() {
  return { scanned: 0, killed: 0, pids: [], disabled: true };
}

/**
 * Find a live non-headless main Chrome PID holding `userDataDir` (including Taskbar PWA `--source-shortcut=` / `--app-id=` windows)
 * and heal `stealth-pid.json` (`headless: false`) if missing or stale.
 */
function findLiveHeadedBrowserPidNative(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return 0;
  try {
    const { profileDirNeedles } = require("./chrome-process-query.cjs");
    const needlesLower = (profileDirNeedles(userDataDir).needles || [])
      .map((n) => String(n || "").replace(/''/g, "'").toLowerCase())
      .filter(Boolean);
    if (needlesLower.length === 0) return 0;
    const rows = scanChromeProcessesNative();
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    for (const r of rows) {
      const cmd = String(r.cmdLower || "");
      if (!cmd || cmd.includes("--type=") || cmd.includes("--headless")) continue;
      if (needlesLower.some((n) => cmd.includes(n))) {
        const pid = Number(r.pid) || 0;
        if (pid > 0) {
          try {
            const sidecarFile = path.join(path.resolve(String(userDataDir)), "stealth-pid.json");
            let prev = null;
            if (fs.existsSync(sidecarFile)) {
              try {
                prev = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
              } catch {
                prev = null;
              }
            }
            if (!prev || Number(prev.pid) !== pid || prev.headless !== false) {
              const portMatch = cmd.match(/--remote-debugging-port=(\d+)/i);
              const debugPort = portMatch ? Number(portMatch[1]) || 0 : Number(prev?.debugPort) || 0;
              fs.writeFileSync(
                sidecarFile,
                JSON.stringify({
                  pid,
                  debugPort,
                  launchedAt: Number(prev?.launchedAt) || Date.now(),
                  headless: false,
                }),
              );
            }
          } catch {
            /* ignore sidecar heal error */
          }
          return pid;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function listChromeProcessesPs(userDataDir) {
  return buildProfileBrowserPidsPs(userDataDir);
}

function listLockOwnerPidsPs() {
  // Deprecated: completely replaced by Win32 native CreateToolhelp32Snapshot + NtQueryInformationProcess (~2ms, 0 child process spawns).
  return "";
}

function resolveExistingProfileLockFiles(userDataDir) {
  const { expandProfileDirAliases } = require("./chrome-process-query.cjs");
  const roots = expandProfileDirAliases(userDataDir);
  const files = [];
  for (const root of roots) {
    for (const name of PROFILE_LOCK_FILES) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) continue;
      try {
        files.push(fs.realpathSync.native(file));
      } catch {
        try {
          files.push(fs.realpathSync(file));
        } catch {
          files.push(path.resolve(file));
        }
      }
    }
  }
  return [...new Set(files)];
}

let lockPsTail = Promise.resolve();
const ALL_CHROME_SNAPSHOT_TTL_MS = 15_000;
/** @type {{ rows: Array<{ pid: number, cmdLower: string }>, at: number } | null} */
let allChromeSnapshot = null;
/** @type {Promise<Array<{ pid: number, cmdLower: string }>> | null} */
let allChromeInFlight = null;

const TCP_LISTENING_TTL_MS = 800;
/** @type {{ map: Map<number, number>, at: number } | null} */
let tcpListeningSnapshot = null;
/** @type {Promise<Map<number, number>> | null} */
let tcpListeningInFlight = null;

async function fetchListeningTcpPortPidMap() {
  if (process.platform !== "win32") return new Map();
  if (tcpListeningSnapshot && Date.now() - tcpListeningSnapshot.at < TCP_LISTENING_TTL_MS) {
    return tcpListeningSnapshot.map;
  }
  if (tcpListeningInFlight) return tcpListeningInFlight;
  tcpListeningInFlight = (async () => {
    const map = new Map();
    try {
      const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "tcp"], {
        timeout: 3500,
        windowsHide: true,
      });
      for (const line of String(stdout || "").split(/\r?\n/)) {
        if (!line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const localAddr = parts[1] || "";
        const colon = localAddr.lastIndexOf(":");
        if (colon < 0) continue;
        const port = Number.parseInt(localAddr.slice(colon + 1), 10);
        const pid = Number.parseInt(parts[parts.length - 1], 10);
        if (Number.isFinite(port) && port > 0 && Number.isFinite(pid) && pid > 0) {
          map.set(port, pid);
        }
      }
    } catch {
      // ignore
    } finally {
      tcpListeningSnapshot = { map, at: Date.now() };
      tcpListeningInFlight = null;
    }
    return map;
  })();
  return tcpListeningInFlight;
}

/**
 * Resolve the listening Chrome main-process PID from its CDP debugPort in ~10ms
 * using native netstat.exe (0 PowerShell spawns, 0 WMI/C# compilation overhead).
 */
async function resolveBrowserPidByDebugPort(debugPort) {
  const port = Number(debugPort);
  if (!Number.isFinite(port) || port <= 0 || process.platform !== "win32") return 0;
  const nativeRows = scanChromeProcessesNative();
  if (Array.isArray(nativeRows) && nativeRows.length > 0) {
    const needle = `--remote-debugging-port=${port}`;
    for (const r of nativeRows) {
      if (r.cmdLower.includes(needle) && !r.cmdLower.includes("--type=")) {
        return r.pid;
      }
    }
  }
  const map = await fetchListeningTcpPortPidMap();
  return map.get(port) || 0;
}

function readFastSidecarMeta(userDataDir) {
  if (!userDataDir) return null;
  try {
    const file = path.join(path.resolve(String(userDataDir)), "stealth-pid.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function tryUnlinkUnlockedProfileLocks(userDataDir) {
  if (!userDataDir) return;
  for (const name of PROFILE_LOCK_FILES) {
    const file = path.join(userDataDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      // still locked by a live process
    }
  }
}

function enqueueLockPs(work) {
  const next = lockPsTail.then(work, work);
  lockPsTail = next.then(() => undefined, () => undefined);
  return next;
}

async function fetchAllChromeProcessesCoalesced() {
  if (allChromeSnapshot && Date.now() - allChromeSnapshot.at < ALL_CHROME_SNAPSHOT_TTL_MS) {
    return allChromeSnapshot.rows;
  }
  const nativeRows = scanChromeProcessesNative();
  if (nativeRows) {
    allChromeSnapshot = { rows: nativeRows, at: Date.now() };
    return nativeRows;
  }
  return [];
}

async function listProfileBrowserPidsByLock() {
  // Deprecated: never spawn PowerShell rstrtmgr.dll lock scans.
  return [];
}

async function listProfileBrowserPids(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return [];
  const key = path.resolve(String(userDataDir));
  const cached = pidListCache.get(key);
  if (cached && Date.now() - cached.at < PID_LIST_CACHE_MS) return cached.pids;
  let cliPids = [];
  try {
    const { profileDirNeedles } = require("./chrome-process-query.cjs");
    const needlesLower = (profileDirNeedles(userDataDir).needles || [])
      .map((n) => String(n || "").replace(/''/g, "'").toLowerCase())
      .filter(Boolean);
    if (needlesLower.length > 0) {
      const allRows = await fetchAllChromeProcessesCoalesced();
      cliPids = allRows
        .filter((r) => needlesLower.some((n) => r.cmdLower.includes(n)))
        .map((r) => r.pid);
    }
  } catch {
    cliPids = [];
  }
  const pids = [...new Set(cliPids)];
  pidListCache.set(key, { pids, at: Date.now() });
  return pids;
}

function invalidateProfileBrowserPidCache(userDataDir, { clearGlobalSnapshot = false } = {}) {
  if (!userDataDir) return;
  pidListCache.delete(path.resolve(String(userDataDir)));
  if (clearGlobalSnapshot) {
    allChromeSnapshot = null;
  }
}

async function hasProfileBrowserProcess(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return false;
  // Fast path 0: check sidecar.pid directly via process.kill(pid, 0) in 0.001ms (zero child process spawns!)
  const sidecar = readFastSidecarMeta(userDataDir);
  if (Number(sidecar?.pid) > 0 && isPidAliveFast(Number(sidecar.pid))) {
    return true;
  }
  // Fast path 1: check active CDP listening port via netstat.exe (0 PowerShell spawns)
  const debugPort = Number(sidecar?.debugPort || readDevToolsActivePort(userDataDir) || 0);
  if (debugPort > 0) {
    const portPid = await resolveBrowserPidByDebugPort(debugPort);
    if (portPid > 0) return true;
  }
  // Fast path 2: if no lock files remain after trying to unlink stale unlocked artifacts, no browser holds the dir
  tryUnlinkUnlockedProfileLocks(userDataDir);
  if (resolveExistingProfileLockFiles(userDataDir).length === 0) {
    return false;
  }
  const pids = await listProfileBrowserPids(userDataDir);
  return pids.length > 0;
}

function isUserDataDirPriorityLocked(userDataDir) {
  if (!userDataDir) return false;
  try {
    const dirNorm = String(userDataDir).toLowerCase();
    const fp = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\priority-agent-locks.json";
    if (!fs.existsSync(fp)) return false;
    const raw = fs.readFileSync(fp, "utf8").replace(/\0/g, "").trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw) || {};
    const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
    const now = Date.now();
    for (const val of Object.values(locks)) {
      if (!val || typeof val !== "object") continue;
      const exp = Number(val.expiresAt || 0);
      const sid = String(val.stealthId || "").trim().toLowerCase();
      if (exp > now && sid && dirNorm.includes(sid)) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Kill Chrome/CloakBrowser processes still holding a profile user-data-dir.
 */
async function killOrphanProfileBrowser(userDataDir, options = {}) {
  invalidateProfileBrowserPidCache(userDataDir);
  if (!userDataDir || process.platform !== "win32") return { killed: 0 };
  if (!options?.forcePriority && isUserDataDirPriorityLocked(userDataDir)) {
    return { killed: 0, skipped: "priority_agent_locked" };
  }
  if (!options?.allowKillHeadedUser) {
    const liveHeadedPid = findLiveHeadedBrowserPidNative(userDataDir);
    if (liveHeadedPid > 0) {
      return { killed: 0, skipped: "user_interactive_session", pid: liveHeadedPid };
    }
  }

  // Fast path: resolve known PID from sidecar + listening debugPort (including explicit debugPortHint)
  const sidecar = readFastSidecarMeta(userDataDir);
  const debugPort = Number(options?.debugPortHint || sidecar?.debugPort || readDevToolsActivePort(userDataDir) || 0);
  const fastPids = new Set();
  if (Number(sidecar?.pid) > 0 && isPidAliveFast(Number(sidecar.pid))) fastPids.add(Number(sidecar.pid));
  if (fastPids.size === 0 && debugPort > 0) {
    const portPid = await resolveBrowserPidByDebugPort(debugPort);
    if (portPid > 0) fastPids.add(portPid);
  }

  let killed = 0;
  if (fastPids.size > 0) {
    markProfileChromeCleanExit(userDataDir);
    const nativeKilled = terminateProcessTreeNative([...fastPids]);
    if (nativeKilled !== null) {
      killed += nativeKilled;
    } else {
      for (const pid of fastPids) {
        try {
          await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
            timeout: 10_000,
            windowsHide: true,
          });
          killed += 1;
        } catch {
          // process may already be gone
        }
      }
    }
    tryUnlinkUnlockedProfileLocks(userDataDir);
    if (resolveExistingProfileLockFiles(userDataDir).length === 0) {
      tcpListeningSnapshot = null;
      return { killed };
    }
  } else {
    tryUnlinkUnlockedProfileLocks(userDataDir);
    if (resolveExistingProfileLockFiles(userDataDir).length === 0) {
      return { killed: 0 };
    }
  }

  const pids = await listProfileBrowserPids(userDataDir);
  if (!pids.length) return { killed };
  markProfileChromeCleanExit(userDataDir);

  const remainingPids = pids.filter((pid) => !fastPids.has(pid));
  const nativeKilledRem = terminateProcessTreeNative(remainingPids);
  if (nativeKilledRem !== null) {
    killed += nativeKilledRem;
  } else {
    for (const pid of remainingPids) {
      try {
        await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          timeout: 10_000,
          windowsHide: true,
        });
        killed += 1;
      } catch {
        // process may already be gone
      }
    }
  }
  invalidateProfileBrowserPidCache(userDataDir, { clearGlobalSnapshot: killed > 0 });
  return { killed };
}

/** Read Chrome DevToolsActivePort from profile dir (attach-over-CDP). */
function readDevToolsActivePort(userDataDir) {
  try {
    const file = path.join(path.resolve(String(userDataDir)), "DevToolsActivePort");
    if (!fs.existsSync(file)) return 0;
    const line = fs.readFileSync(file, "utf8").trim().split(/\r?\n/)[0] || "";
    const port = Number.parseInt(line, 10);
    return Number.isFinite(port) && port > 0 ? port : 0;
  } catch {
    return 0;
  }
}

/** Bring an orphan profile browser window to foreground (no Playwright context). */
async function focusProfileBrowserWindow(userDataDir, options = {}) {
  if (!userDataDir || process.platform !== "win32") return { ok: false, reason: "unsupported" };
  let targetWorkArea = options?.targetWorkArea || null;
  if (!targetWorkArea) {
    try {
      const { resolveTargetDisplayWorkArea } = require("./app-settings.cjs");
      targetWorkArea = resolveTargetDisplayWorkArea()?.workArea || null;
    } catch {
      targetWorkArea = null;
    }
  }

  const u32 = getOrphanUser32Api();
  const procApi = getOrphanNativeApi();
  if (u32 && procApi) {
    try {
      const { profileDirNeedles } = require("./chrome-process-query.cjs");
      const needlesLower = (profileDirNeedles(userDataDir).needles || [])
        .map((n) => String(n || "").replace(/''/g, "'").toLowerCase())
        .filter(Boolean);
      const mainPids = [];
      const childPids = [];
      const sidecar = readFastSidecarMeta(userDataDir);
      const sidecarPid = Number(sidecar?.pid) || 0;
      if (sidecarPid > 0 && sidecar?.headless !== true && isPidAliveFast(sidecarPid)) {
        mainPids.push(sidecarPid);
      }
      const rows = scanChromeProcessesNative({ forceFresh: true }) || [];
      for (const r of rows) {
        const cmd = String(r.cmdLower || "");
        if (!cmd || !needlesLower.some((n) => cmd.includes(n))) continue;
        if (cmd.includes("--type=")) {
          childPids.push(r.pid);
        } else {
          mainPids.push(r.pid);
        }
      }
      const candidatePids = [...new Set([...mainPids, ...childPids])];
      if (candidatePids.length === 0) {
        return { ok: false, reason: "not-running" };
      }
      const hwnd = findMainWindowForPidsNative(candidatePids);
      if (!hwnd) {
        return { ok: false, reason: "no-window" };
      }

      if (u32.IsIconic(hwnd)) {
        u32.ShowWindow(hwnd, 9); // SW_RESTORE
      }

      if (
        targetWorkArea &&
        Number.isFinite(targetWorkArea.x) &&
        Number.isFinite(targetWorkArea.y) &&
        targetWorkArea.width >= 320 &&
        targetWorkArea.height >= 240
      ) {
        const waX = Math.round(targetWorkArea.x);
        const waY = Math.round(targetWorkArea.y);
        const waW = Math.round(targetWorkArea.width);
        const waH = Math.round(targetWorkArea.height);
        const rc = { Left: 0, Top: 0, Right: 0, Bottom: 0 };
        if (u32.GetWindowRect(hwnd, rc)) {
          const cx = Math.trunc((rc.Left + rc.Right) / 2);
          const cy = Math.trunc((rc.Top + rc.Bottom) / 2);
          const onTarget = cx >= waX && cx < waX + waW && cy >= waY && cy < waY + waH;
          if (!onTarget) {
            const wasMax = Boolean(u32.IsZoomed(hwnd));
            u32.ShowWindow(hwnd, 9);
            const nw = Math.min(1440, Math.max(800, waW - 80));
            const nh = Math.min(900, Math.max(600, waH - 60));
            u32.MoveWindow(hwnd, waX + 40, waY + 30, nw, nh, true);
            if (wasMax) u32.ShowWindow(hwnd, 3); // SW_MAXIMIZE
          }
        }
      }

      u32.BringWindowToTop(hwnd);
      if (!u32.SetForegroundWindow(hwnd)) {
        const fg = u32.GetForegroundWindow();
        const pidOut = [0];
        const fgTid = fg ? u32.GetWindowThreadProcessId(fg, pidOut) : 0;
        const curTid = u32.GetCurrentThreadId();
        if (fgTid && curTid && fgTid !== curTid) {
          if (u32.AttachThreadInput(curTid, fgTid, true)) {
            try {
              u32.BringWindowToTop(hwnd);
              u32.SetForegroundWindow(hwnd);
            } finally {
              u32.AttachThreadInput(curTid, fgTid, false);
            }
          }
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  const script = buildFocusProfileWindowPs(userDataDir, targetWorkArea);

  try {
    const stdout = await runPowerShellCommandAsync(script);
    const result = String(stdout).trim().split(/\r?\n/).pop()?.trim();
    if (result === "OK") return { ok: true };
    if (result === "MISSING") return { ok: false, reason: "not-running" };
    return { ok: false, reason: "no-window" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Zero-WMI native sweep (<5ms via Toolhelp32Snapshot + NtQueryInformationProcess) that reaps:
 * 1. Orphaned `chrome-headless.exe` / `chrome-headless-shell.exe` `--type=*` children whose parent PID is dead.
 * 2. Untracked root `chrome-headless.exe` trees (> minAgeMs, `--headless`) not tracked by P0003 SessionManager
 *    (strictly excluding customer `8xxx` and user protected `0001-0021`, `0059`, `0069` profiles).
 */
function reapUntrackedHeadlessBrowsersNative({
  trackedDirs = [],
  trackedIds = [],
  trackedPorts = [],
  minAgeMs = 180_000,
} = {}) {
  const api = getOrphanNativeApi();
  if (!api || process.platform !== "win32") return { scanned: 0, killed: 0, rootTrees: 0 };
  const snap = api.CreateToolhelp32Snapshot(0x00000002, 0);
  if (!snap) return { scanned: 0, killed: 0, rootTrees: 0 };

  const dirSet = new Set(trackedDirs.map((d) => String(d || "").trim().toLowerCase()).filter(Boolean));
  const idList = trackedIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean);
  const portSet = new Set(trackedPorts.map((p) => Number(p)).filter((p) => Number.isFinite(p) && p > 0));

  const allPids = new Set();
  const headlessProcs = [];
  const pe = { dwSize: api.peSize };
  try {
    if (api.Process32FirstW(snap, pe)) {
      do {
        const pid = Number(pe.th32ProcessID);
        const ppid = Number(pe.th32ParentProcessID);
        allPids.add(pid);
        let end = 0;
        while (end < 260 && pe.szExeFile[end] !== 0) end++;
        const name = String.fromCharCode(...pe.szExeFile.subarray(0, end)).toLowerCase();
        if (name === "chrome-headless.exe" || name === "chrome-headless-shell.exe") {
          headlessProcs.push({ pid, ppid, name });
        }
      } while (api.Process32NextW(snap, pe));
    }
  } finally {
    api.CloseHandle(snap);
  }

  if (headlessProcs.length === 0) return { scanned: 0, killed: 0, rootTrees: 0 };
  const headlessPidSet = new Set(headlessProcs.map((p) => p.pid));
  const now = Date.now();
  const buf = Buffer.alloc(32768);
  const ftBuf = Buffer.alloc(32);
  const retLen = [0];
  const toKillRoots = [];

  for (const p of headlessProcs) {
    if (headlessPidSet.has(p.ppid)) continue;
    let cmd = "";
    let createdMs = 0;
    const h = api.OpenProcess(0x1000, false, p.pid);
    if (h) {
      try {
        if (api.NtQueryInformationProcess(h, 60, buf, buf.length, retLen) === 0) {
          const len = buf.readUInt16LE(0);
          const ptr = Number(buf.readBigUInt64LE(8));
          if (len > 0 && ptr > 0 && 16 + len <= buf.length) {
            cmd = buf.subarray(16, 16 + len).toString("utf16le");
          }
        }
        createdMs = getProcessCreatedEpochMs(api, h, ftBuf);
      } catch {
        /* ignore */
      } finally {
        api.CloseHandle(h);
      }
    }
    if (!allPids.has(p.ppid) && /--type=/i.test(cmd)) {
      toKillRoots.push(p.pid);
      continue;
    }
    if (!cmd || /--type=/i.test(cmd) || !/--headless\b/i.test(cmd)) continue;
    if (createdMs <= 0 || now - createdMs < minAgeMs) continue;
    if (/--stealth-profile-code=(?:8\d{3}|00(?:0[1-9]|1\d|2[01]|59|69))\b/i.test(cmd)) continue;

    const mDir = cmd.match(/--user-data-dir=(?:"([^"]+)"|([^\s]+))/i);
    const dirLower = String(mDir?.[1] || mDir?.[2] || "").trim().toLowerCase();
    const mPort = cmd.match(/--remote-debugging-port=(\d+)/i);
    const portNum = Number(mPort?.[1] || 0);
    const isTracked =
      (dirLower && dirSet.has(dirLower)) ||
      (portNum > 0 && portSet.has(portNum)) ||
      (dirLower && idList.some((tid) => tid && dirLower.includes(tid)));
    if (!isTracked) {
      toKillRoots.push(p.pid);
    }
  }

  if (toKillRoots.length === 0) return { scanned: headlessProcs.length, killed: 0, rootTrees: 0 };
  const killed = terminateProcessTreeNative(toKillRoots) || 0;
  return { scanned: headlessProcs.length, killed, rootTrees: toKillRoots.length };
}

module.exports = {
  CHROME_NAMES,
  PROFILE_LOCK_FILES,
  listChromeProcessesPs,
  listProfileBrowserPids,
  listProfileBrowserPidsByLock,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  readDevToolsActivePort,
  resolveBrowserPidByDebugPort,
  focusProfileBrowserWindow,
  resolveExistingProfileLockFiles,
  terminateProcessTreeNative,
  scanChromeProcessesNative,
  reapOrphanAdbScrcpyProcessesNative,
  reapDuplicateTaskbarPwaProcessesNative,
  reapUntrackedHeadlessBrowsersNative,
  findLiveHeadedBrowserPidNative,
  getOrphanUser32Api,
  findMainWindowForPidsNative,
  hasMainWindowForPidNative,
};
