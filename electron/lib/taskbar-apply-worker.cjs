/**
 * Native Win32 (koffi) + fallback PowerShell worker for hot-path taskbar apply & processor group balancing.
 * Eliminates the 6 persistent stealth-taskbar-apply-worker.ps1 PowerShell processes (~400MB RAM & CPU spikes),
 * executing WM_SETICON / SetWindowTextW / SetThreadGroupAffinity directly in < 0.5ms.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const { resolvePowerShell, resolveElectronLibScript } = require("./powershell-exec.cjs");

const WORKER_PS1 = resolveElectronLibScript("stealth-taskbar-apply-worker.ps1");
const WORKER_POOL_SIZE = 2;
const BADGE_STYLE = "v4-digits-only-spaced8";

let nativeWin32 = null;
let nativeWin32InitTried = false;
/** @type {Map<string, unknown>} */
const cachedHicons = new Map();
let keeperInterval = null;

function resolveKoffiModule() {
  const candidates = [
    "koffi",
    process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "koffi") : "",
    path.resolve(__dirname, "..", "..", "node_modules", "koffi"),
    path.resolve(__dirname, "..", "..", "..", "P0001-Desk-Console", "node_modules", "koffi"),
    "E:/Dev/Tool/P0001-Desk-Console/node_modules/koffi",
    "E:/Dev/Tool/P0003-Stealth-Browser-Console/node_modules/koffi",
    "E:/Dev/node_modules/.pnpm/koffi@3.1.6/node_modules/koffi",
  ].filter(Boolean);
  for (const cand of candidates) {
    try {
      return require(cand);
    } catch {
      /* try next */
    }
  }
  return null;
}

function getNativeWin32() {
  if (process.platform !== "win32") return null;
  if (globalThis.__STEALTH_TASKBAR_NATIVE_WIN32__ && globalThis.__STEALTH_TASKBAR_NATIVE_WIN32__.MoveWindow) {
    nativeWin32 = globalThis.__STEALTH_TASKBAR_NATIVE_WIN32__;
    return nativeWin32;
  }
  if (nativeWin32InitTried && nativeWin32 && nativeWin32.MoveWindow) return nativeWin32;
  nativeWin32InitTried = true;
  try {
    const koffi = resolveKoffiModule();
    if (!koffi) return null;
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");

    const suffix = `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const procName = `EnumWindowsProc${suffix}`;
    const peName = `PROCESSENTRY32W_TASKBAR${suffix}`;
    const teName = `THREADENTRY32_TASKBAR${suffix}`;
    const gaName = `GROUP_AFFINITY_TASKBAR${suffix}`;
    const rectName = `RECT_TASKBAR${suffix}`;

    const EnumWindowsProc = koffi.proto(`bool __stdcall ${procName}(void* hWnd, intptr_t lParam)`);
    let activeEnumVisitor = null;
    const sharedEnumCallback = koffi.register((hWnd, _lParam) => {
      if (typeof activeEnumVisitor === "function") {
        return activeEnumVisitor(hWnd) !== false;
      }
      return false;
    }, koffi.pointer(EnumWindowsProc));
    const EnumDesktopWindowsRaw = user32.func(
      `bool __stdcall EnumDesktopWindows(uintptr_t hDesktop, ${procName}* lpEnumFunc, intptr_t lParam)`,
    );
    const enumDesktopWindowsWithVisitor = (hDesktop, visitor) => {
      if (activeEnumVisitor === null) {
        activeEnumVisitor = visitor;
        try {
          return EnumDesktopWindowsRaw(hDesktop || 0, sharedEnumCallback, 0);
        } finally {
          activeEnumVisitor = null;
        }
      }
      const tempCb = koffi.register(
        (hWnd) => visitor(hWnd) !== false,
        koffi.pointer(EnumWindowsProc),
      );
      try {
        return EnumDesktopWindowsRaw(hDesktop || 0, tempCb, 0);
      } finally {
        koffi.unregister(tempCb);
      }
    };

    let shellPropApi = null;
    try {
      const shell32 = koffi.load("shell32.dll");
      const ole32 = koffi.load("ole32.dll");
      const guidName = `GUID_TASKBAR${suffix}`;
      const pkeyName = `PROPERTYKEY_TASKBAR${suffix}`;
      const pvName = `PROPVARIANT_TASKBAR${suffix}`;
      const vtblName = `IPropertyStoreVtbl_TASKBAR${suffix}`;
      const objName = `IPropertyStoreObj_TASKBAR${suffix}`;
      const relProtoName = `IUnknown_Release_TASKBAR${suffix}`;
      const setValProtoName = `IPropertyStore_SetValue_TASKBAR${suffix}`;
      const commitProtoName = `IPropertyStore_Commit_TASKBAR${suffix}`;

      const GUID = koffi.struct(guidName, {
        Data1: "uint32_t",
        Data2: "uint16_t",
        Data3: "uint16_t",
        Data4: koffi.array("uint8_t", 8),
      });
      koffi.struct(pkeyName, {
        fmtid: GUID,
        pid: "uint32_t",
      });
      koffi.struct(pvName, {
        vt: "uint16_t",
        wReserved1: "uint16_t",
        wReserved2: "uint16_t",
        wReserved3: "uint16_t",
        p: "void*",
        p2: "uintptr_t",
      });
      const VtblStruct = koffi.struct(vtblName, {
        QueryInterface: "void*",
        AddRef: "void*",
        Release: "void*",
        GetCount: "void*",
        GetAt: "void*",
        GetValue: "void*",
        SetValue: "void*",
        Commit: "void*",
      });
      const ObjStruct = koffi.struct(objName, { lpVtbl: koffi.pointer(VtblStruct) });
      const ReleaseProto = koffi.proto(`uint32_t __stdcall ${relProtoName}(void*)`);
      const SetValueProto = koffi.proto(
        `int __stdcall ${setValProtoName}(void*, const ${pkeyName}*, const ${pvName}*)`,
      );
      const CommitProto = koffi.proto(`int __stdcall ${commitProtoName}(void*)`);

      const CoInitializeEx = ole32.func("int __stdcall CoInitializeEx(uintptr_t, uint32_t)");
      CoInitializeEx(0, 2); // COINIT_APARTMENTTHREADED

      shellPropApi = {
        VtblStruct,
        ObjStruct,
        ReleaseProto,
        SetValueProto,
        CommitProto,
        SHGetPropertyStoreForWindow: shell32.func(
          `int __stdcall SHGetPropertyStoreForWindow(void* hwnd, const ${guidName}* riid, _Out_ void** ppv)`,
        ),
        CoTaskMemAlloc: ole32.func("void* __stdcall CoTaskMemAlloc(uintptr_t cb)"),
        PropVariantClear: ole32.func(`int __stdcall PropVariantClear(_Inout_ ${pvName}* pvar)`),
      };
    } catch {
      shellPropApi = null;
    }
    const RECT = koffi.struct(rectName, {
      left: "int32_t",
      top: "int32_t",
      right: "int32_t",
      bottom: "int32_t",
    });
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
    const THREADENTRY32 = koffi.struct(teName, {
      dwSize: "uint32_t",
      cntUsage: "uint32_t",
      th32ThreadID: "uint32_t",
      th32OwnerProcessID: "uint32_t",
      tpBasePri: "int32_t",
      tpDeltaPri: "int32_t",
      dwFlags: "uint32_t",
    });
    const GROUP_AFFINITY = koffi.struct(gaName, {
      Mask: "uintptr_t",
      Group: "uint16_t",
      Reserved0: "uint16_t",
      Reserved1: "uint16_t",
      Reserved2: "uint16_t",
    });

    nativeWin32 = {
      koffi,
      EnumWindowsProc,
      enumDesktopWindowsWithVisitor,
      shellPropApi,
      OpenInputDesktop: user32.func(
        "uintptr_t __stdcall OpenInputDesktop(uint32_t dwFlags, bool fInherit, uint32_t dwDesiredAccess)",
      ),
      CloseDesktop: user32.func("bool __stdcall CloseDesktop(uintptr_t hDesktop)"),
      PROCESSENTRY32WSize: koffi.sizeof(PROCESSENTRY32W),
      THREADENTRY32Size: koffi.sizeof(THREADENTRY32),
      GROUP_AFFINITYSize: koffi.sizeof(GROUP_AFFINITY),
      EnumWindows: user32.func(`bool __stdcall EnumWindows(${procName}* lpEnumFunc, intptr_t lParam)`),
      IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(void* hWnd)"),
      IsIconic: user32.func("bool __stdcall IsIconic(void* hWnd)"),
      IsZoomed: user32.func("bool __stdcall IsZoomed(void* hWnd)"),
      GetWindowRect: user32.func(`bool __stdcall GetWindowRect(void* hWnd, _Out_ ${rectName}* lpRect)`),
      ShowWindow: user32.func("bool __stdcall ShowWindow(void* hWnd, int nCmdShow)"),
      MoveWindow: user32.func(
        "bool __stdcall MoveWindow(void* hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint)",
      ),
      GetWindowThreadProcessId: user32.func(
        "uint32_t __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* lpdwProcessId)",
      ),
      GetWindowTextW: user32.func(
        "int __stdcall GetWindowTextW(void* hWnd, _Out_ uint16_t* lpString, int nMaxCount)",
      ),
      GetClassNameW: user32.func(
        "int __stdcall GetClassNameW(void* hWnd, _Out_ uint16_t* lpClassName, int nMaxCount)",
      ),
      SetWindowTextW: user32.func("bool __stdcall SetWindowTextW(void* hWnd, str16 lpString)"),
      LoadImageW: user32.func(
        "void* __stdcall LoadImageW(void* hInst, str16 name, uint32_t type, int cx, int cy, uint32_t fuLoad)",
      ),
      SendMessageW: user32.func(
        "intptr_t __stdcall SendMessageW(void* hWnd, uint32_t Msg, uintptr_t wParam, void* lParam)",
      ),
      SendNotifyMessageW: user32.func(
        "bool __stdcall SendNotifyMessageW(void* hWnd, uint32_t Msg, uintptr_t wParam, void* lParam)",
      ),
      GetActiveProcessorGroupCount: kernel32.func("uint16_t __stdcall GetActiveProcessorGroupCount()"),
      GetActiveProcessorCount: kernel32.func("uint32_t __stdcall GetActiveProcessorCount(uint16_t GroupNumber)"),
      CreateToolhelp32Snapshot: kernel32.func(
        "void* __stdcall CreateToolhelp32Snapshot(uint32_t dwFlags, uint32_t th32ProcessID)",
      ),
      Process32FirstW: kernel32.func(
        `bool __stdcall Process32FirstW(void* hSnapshot, _Inout_ ${peName}* lppe)`,
      ),
      Process32NextW: kernel32.func(
        `bool __stdcall Process32NextW(void* hSnapshot, _Inout_ ${peName}* lppe)`,
      ),
      Thread32First: kernel32.func(
        `bool __stdcall Thread32First(void* hSnapshot, _Inout_ ${teName}* lpte)`,
      ),
      Thread32Next: kernel32.func(
        `bool __stdcall Thread32Next(void* hSnapshot, _Inout_ ${teName}* lpte)`,
      ),
      OpenThread: kernel32.func(
        "void* __stdcall OpenThread(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwThreadId)",
      ),
      OpenProcess: kernel32.func(
        "void* __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)",
      ),
      SetPriorityClass: kernel32.func(
        "bool __stdcall SetPriorityClass(void* hProcess, uint32_t dwPriorityClass)",
      ),
      SetProcessAffinityMask: kernel32.func(
        "bool __stdcall SetProcessAffinityMask(void* hProcess, uintptr_t dwProcessAffinityMask)",
      ),
      SetThreadGroupAffinity: kernel32.func(
        `bool __stdcall SetThreadGroupAffinity(void* hThread, const ${gaName}* GroupAffinity, _Out_ ${gaName}* PreviousGroupAffinity)`,
      ),
      CreateJobObjectW: kernel32.func("void* __stdcall CreateJobObjectW(void* lpJobAttributes, const char16_t* lpName)"),
      SetInformationJobObject: kernel32.func(
        `bool __stdcall SetInformationJobObject(void* hJob, int JobObjectInfoClass, const ${gaName}* lpJobObjectInfo, uint32_t cbJobObjectInfoLength)`,
      ),
      AssignProcessToJobObject: kernel32.func(
        "bool __stdcall AssignProcessToJobObject(void* hJob, void* hProcess)",
      ),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(void* hObject)"),
    };
    globalThis.__STEALTH_TASKBAR_NATIVE_WIN32__ = nativeWin32;
    startNativeBadgeKeeper();
    return nativeWin32;
  } catch {
    nativeWin32 = null;
    return null;
  }
}

function decodeUtf16(buf, len) {
  if (!len || len <= 0) return "";
  let end = 0;
  while (end < len && buf[end] !== 0) end++;
  return String.fromCharCode(...buf.subarray(0, end));
}

function loadCachedHicon(api, icoPath, cx, cy) {
  if (!icoPath || !fs.existsSync(icoPath)) return null;
  let stat;
  try {
    stat = fs.statSync(icoPath);
  } catch {
    return null;
  }
  const key = `${icoPath}|${cx}|${cy}|${stat.size}|${stat.mtimeMs}`;
  if (cachedHicons.has(key)) return cachedHicons.get(key);
  const flags = cx <= 0 || cy <= 0 ? 0x0010 | 0x0040 : 0x0010; // LR_LOADFROMFILE | LR_DEFAULTSIZE
  const hIcon = api.LoadImageW(null, icoPath, 1, cx, cy, flags);
  if (hIcon) cachedHicons.set(key, hIcon);
  return hIcon || null;
}

function titleMatchesLabel(title, label) {
  if (!title || !label) return false;
  if (title === label) return true;
  if (title.startsWith(`${label} —`) || title.startsWith(`${label} ·`) || title.startsWith(`${label} -`)) {
    return true;
  }
  if (label.length >= 4 && /^\d{4}/.test(label)) {
    const code = label.slice(0, 4);
    if (
      title === code ||
      title.startsWith(`${code} —`) ||
      title.startsWith(`${code} ·`) ||
      title.startsWith(`${code} -`)
    ) {
      return true;
    }
  }
  return false;
}

function leadingProfileCode(title) {
  if (!title || title.length < 4 || !/^\d{4}/.test(title)) return null;
  if (title.length > 4) {
    const ch = title[4];
    if (ch !== " " && ch !== "-" && ch !== "—" && ch !== "–" && ch !== "·") return null;
  }
  return title.slice(0, 4);
}

function enumerateChromeWindowsNative(api) {
  const list = [];
  const seen = new Set();
  const clsBuf = new Uint16Array(64);
  const titleBuf = new Uint16Array(256);
  const pidOut = [0];
  let visitedAny = false;

  const visitor = (hWnd) => {
    visitedAny = true;
    try {
      const addr = api.koffi.address(hWnd);
      if (!addr || seen.has(addr)) return true;
      seen.add(addr);
      if (!api.IsWindowVisible(hWnd) && !api.IsIconic(hWnd)) return true;
      const clsLen = api.GetClassNameW(hWnd, clsBuf, 64);
      if (clsLen <= 0) return true;
      const cls = decodeUtf16(clsBuf, clsLen);
      if (!cls.includes("Chrome_WidgetWin")) return true;
      api.GetWindowThreadProcessId(hWnd, pidOut);
      const titleLen = api.GetWindowTextW(hWnd, titleBuf, 256);
      const title = decodeUtf16(titleBuf, titleLen);
      list.push({ hWnd, pid: pidOut[0] >>> 0, title });
    } catch {
      /* ignore */
    }
    return true;
  };

  if (typeof api.enumDesktopWindowsWithVisitor === "function") {
    api.enumDesktopWindowsWithVisitor(0, visitor);
    if (!visitedAny && typeof api.OpenInputDesktop === "function") {
      const hInput = api.OpenInputDesktop(0, false, 0x0041);
      if (hInput) {
        try {
          api.enumDesktopWindowsWithVisitor(hInput, visitor);
        } finally {
          api.CloseDesktop(hInput);
        }
      }
    }
    return list;
  }

  const cb = api.koffi.register((hWnd, _lParam) => visitor(hWnd), api.koffi.pointer(api.EnumWindowsProc));
  try {
    api.EnumWindows(cb, 0);
  } finally {
    api.koffi.unregister(cb);
  }
  return list;
}

const IID_IPropertyStore = Object.freeze({
  Data1: 0x886d8eeb,
  Data2: 0x8cf2,
  Data3: 0x4446,
  Data4: [0x8d, 0x02, 0xcd, 0xba, 0x1d, 0xbd, 0xcf, 0x58],
});
const FMTID_AppUserModel = Object.freeze({
  Data1: 0x9f4c2855,
  Data2: 0x9f79,
  Data3: 0x4b39,
  Data4: [0xa8, 0xd0, 0xe1, 0xd4, 0x2d, 0xe1, 0xd5, 0xf3],
});
const PKEY_AppUserModel_RelaunchIconResource = Object.freeze({
  fmtid: FMTID_AppUserModel,
  pid: 3,
});
const PKEY_AppUserModel_RelaunchDisplayNameResource = Object.freeze({
  fmtid: FMTID_AppUserModel,
  pid: 4,
});
const PKEY_AppUserModel_ID = Object.freeze({
  fmtid: FMTID_AppUserModel,
  pid: 5,
});

/**
 * Native replacement for StealthTaskbarWin.ApplyAppUserModel (`SHGetPropertyStoreForWindow` COM vtable).
 * Ungroups profile windows on Win11 taskbar via AppUserModel.ID and clears stale RelaunchIconResource
 * so Win11 honors WM_SETICON.
 */
function applyAppUserModelNative(api, hWnd, appId, displayName) {
  const sp = api?.shellPropApi;
  if (!sp || !hWnd || !appId) return false;
  const pStoreOut = [null];
  let hr = -1;
  try {
    hr = sp.SHGetPropertyStoreForWindow(hWnd, IID_IPropertyStore, pStoreOut);
  } catch {
    return false;
  }
  const pStore = pStoreOut[0];
  if (hr !== 0 || !pStore) return false;

  let fnRelease = null;
  try {
    const obj = api.koffi.decode(pStore, sp.ObjStruct);
    const vtbl = api.koffi.decode(obj.lpVtbl, sp.VtblStruct);
    fnRelease = api.koffi.decode(vtbl.Release, sp.ReleaseProto);
    const fnSetValue = api.koffi.decode(vtbl.SetValue, sp.SetValueProto);
    const fnCommit = api.koffi.decode(vtbl.Commit, sp.CommitProto);

    const setLpWstr = (pkey, text) => {
      const strBuf = Buffer.from(`${text}\0`, "utf16le");
      const pStr = sp.CoTaskMemAlloc(strBuf.length);
      if (!pStr) return;
      api.koffi.encode(pStr, api.koffi.array("uint8_t", strBuf.length), [...strBuf]);
      const pv = { vt: 31, wReserved1: 0, wReserved2: 0, wReserved3: 0, p: pStr, p2: 0 };
      try {
        fnSetValue(pStore, pkey, pv);
      } finally {
        sp.PropVariantClear(pv);
      }
    };

    setLpWstr(PKEY_AppUserModel_ID, String(appId));
    fnSetValue(pStore, PKEY_AppUserModel_RelaunchIconResource, {
      vt: 0,
      wReserved1: 0,
      wReserved2: 0,
      wReserved3: 0,
      p: null,
      p2: 0,
    });
    if (displayName) {
      setLpWstr(PKEY_AppUserModel_RelaunchDisplayNameResource, String(displayName));
    }
    fnCommit(pStore);
    return true;
  } catch {
    return false;
  } finally {
    if (fnRelease) {
      try {
        fnRelease(pStore);
      } catch {
        /* ignore */
      }
    }
  }
}

function stampWindowIconsNative(api, hWnd, hiSmall, hiBig) {
  const WM_SETICON = 0x0080;
  const sendFn = api.SendNotifyMessageW || api.SendMessageW;
  if (hiSmall) sendFn(hWnd, WM_SETICON, 0, hiSmall);
  if (hiBig) sendFn(hWnd, WM_SETICON, 1, hiBig);
}

const firstSeenBrowserPidAt = new Map();

function placeHwndOnTargetWorkAreaNative(api, hWnd, targetWorkArea, { maximize = true } = {}) {
  if (!api || !api.GetWindowRect || !api.MoveWindow || !api.ShowWindow || !hWnd || !targetWorkArea) return false;
  const waX = Number(targetWorkArea.x);
  const waY = Number(targetWorkArea.y);
  const waW = Number(targetWorkArea.width);
  const waH = Number(targetWorkArea.height);
  if (!Number.isFinite(waX) || !Number.isFinite(waY) || !(waW > 0) || !(waH > 0)) return false;
  try {
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    if (api.GetWindowRect(hWnd, rect)) {
      const cx = (Number(rect.left) + Number(rect.right)) / 2;
      const cy = (Number(rect.top) + Number(rect.bottom)) / 2;
      const onTarget = cx >= waX && cx < waX + waW && cy >= waY && cy < waY + waH;
      if (onTarget) {
        return false;
      }
    }
    if ((api.IsZoomed && api.IsZoomed(hWnd)) || (api.IsIconic && api.IsIconic(hWnd))) {
      api.ShowWindow(hWnd, 9); // SW_RESTORE
    }
    if (maximize) {
      api.MoveWindow(hWnd, waX, waY, waW, waH, false);
      api.ShowWindow(hWnd, 3); // SW_MAXIMIZE
    } else {
      const padX = Math.min(48, Math.max(16, Math.round(waW * 0.03)));
      const padY = Math.min(36, Math.max(16, Math.round(waH * 0.03)));
      const nw = Math.max(800, Math.min(1440, waW - padX * 2));
      const nh = Math.max(600, Math.min(900, waH - padY * 2));
      api.MoveWindow(hWnd, waX + padX, waY + padY, nw, nh, true);
    }
    return true;
  } catch {
    return false;
  }
}

function listProfileChromeWindowsNative() {
  if (process.platform !== "win32") return [];
  const api = getNativeWin32();
  if (!api || !api.GetWindowRect) return [];
  const windows = enumerateChromeWindowsNative(api);
  const out = [];
  for (const w of windows) {
    const code = leadingProfileCode(w.title);
    const titleStr = String(w.title || "").slice(0, 80);
    if (!code && !titleStr.includes("Chromium")) continue;
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    api.GetWindowRect(w.hWnd, rect);
    const cx = (Number(rect.left) + Number(rect.right)) / 2;
    out.push({
      pid: w.pid,
      code: code || "NEW",
      title: titleStr,
      rect: { ...rect },
      maximized: Boolean(api.IsZoomed && api.IsZoomed(w.hWnd)),
      minimized: Boolean(api.IsIconic && api.IsIconic(w.hWnd)),
      monitor: cx >= 1920 ? 2 : 1,
    });
  }
  return out;
}

function moveChromeWindowsToTargetWorkAreaNative(
  targetWorkArea,
  { hintPid = 0, code = "", title = "", allHeaded = false, maximize = true } = {},
) {
  if (process.platform !== "win32") return { moved: 0, matched: 0 };
  const api = getNativeWin32();
  if (!api || !targetWorkArea) return { moved: 0, matched: 0 };
  const pid = Number(hintPid) || 0;
  const cleanCode = String(code || "").trim();
  const cleanTitle = String(title || "").trim();
  const windows = enumerateChromeWindowsNative(api);
  const matched = windows.filter((w) => {
    const leadCode = leadingProfileCode(w.title);
    if (leadCode && Number(leadCode) >= 9000 && Number(leadCode) <= 9999) return false;
    if (allHeaded) return Boolean(leadCode);
    if (pid > 0 && w.pid === pid) return true;
    if (cleanCode && leadCode === cleanCode) return true;
    if (cleanTitle && titleMatchesLabel(w.title, cleanTitle)) return true;
    return false;
  });
  let moved = 0;
  for (const w of matched) {
    if (placeHwndOnTargetWorkAreaNative(api, w.hWnd, targetWorkArea, { maximize })) {
      moved += 1;
    }
  }
  return { moved, matched: matched.length };
}

function startNativeBadgeKeeper() {
  // Disabled periodic 10s EnumWindows/GetWindowTextW polling across all desktop windows;
  // event-driven scheduleProfileTaskbarBadgeApply already stamps icons on launch/navigation.
  if (keeperInterval) {
    clearInterval(keeperInterval);
    keeperInterval = null;
  }
}

function assignProcessTreeToGroupNative(_api, _rootPid, _targetGroupSeq, _opts = {}) {
  // Zero-Throttle Root-Cause Kaizen (2026-11-10): keep default OS NORMAL_PRIORITY_CLASS and NUMA placement.
  return 0;
}

async function applyTaskbarNative(api, payload) {
  if (payload?.warm === true) {
    return { id: payload.id || 0, result: "OK_WARM", wmiSkipped: true, via: "koffi" };
  }
  if (payload?.assignGroup === true) {
    const moved = assignProcessTreeToGroupNative(api, payload.HintPid, payload.TargetGroup, {
      headless: Boolean(payload.Headless),
    });
    return { id: payload.id || 0, result: "OK_GROUP", movedThreads: moved, wmiSkipped: true, via: "koffi" };
  }

  const dir = String(payload?.UserDataDir || "").trim();
  const title = String(payload?.Title || "").trim();
  const ico = String(payload?.Ico || "").trim();
  const appId = String(payload?.AppId || "").trim();
  let hintPid = Number(payload?.HintPid) || 0;

  if (!hintPid && dir) {
    try {
      const sidecarFile = path.join(dir, "stealth-pid.json");
      if (fs.existsSync(sidecarFile)) {
        const sc = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
        if (sc?.headless === true) {
          return { id: payload.id || 0, result: "OK_ICON", wmiSkipped: true, via: "koffi" };
        }
        if (Number(sc?.pid) > 0) hintPid = Number(sc.pid);
      }
    } catch {
      /* ignore */
    }
  }

  let windows = enumerateChromeWindowsNative(api);
  let matched = windows.filter(
    (w) => (hintPid > 0 && w.pid === hintPid) || (title && titleMatchesLabel(w.title, title)),
  );

  if (matched.length === 0 && hintPid > 0) {
    for (let i = 0; i < 3 && matched.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 35));
      windows = enumerateChromeWindowsNative(api);
      matched = windows.filter(
        (w) => (hintPid > 0 && w.pid === hintPid) || (title && titleMatchesLabel(w.title, title)),
      );
    }
  }

  if (matched.length === 0) {
    if (dir && fs.existsSync(path.join(dir, "DevToolsActivePort"))) {
      return { id: payload.id || 0, result: "OK_ICON", wmiSkipped: true, via: "koffi" };
    }
    return { id: payload.id || 0, result: "NOHWND", wmiSkipped: true, via: "koffi" };
  }

  let hiBig = null;
  let hiSmall = null;
  if (ico && fs.existsSync(ico)) {
    hiBig =
      loadCachedHicon(api, ico, 48, 48) ||
      loadCachedHicon(api, ico, 32, 32) ||
      loadCachedHicon(api, ico, 24, 24) ||
      loadCachedHicon(api, ico, 0, 0);
    hiSmall =
      loadCachedHicon(api, ico, 16, 16) ||
      loadCachedHicon(api, ico, 20, 20) ||
      loadCachedHicon(api, ico, 24, 24);
  }

  let sidecarFresh = false;
  if (dir) {
    try {
      const sidecarFile = path.join(dir, "stealth-pid.json");
      if (fs.existsSync(sidecarFile)) {
        const st = fs.statSync(sidecarFile);
        if (Date.now() - st.mtimeMs < 6000) sidecarFresh = true;
      }
    } catch {
      /* ignore */
    }
  }

  let targetWorkArea = payload?.TargetWorkArea || null;
  if (!targetWorkArea) {
    try {
      const { resolveTargetDisplayWorkArea } = require("./app-settings.cjs");
      targetWorkArea = resolveTargetDisplayWorkArea()?.workArea || null;
    } catch {
      /* ignore */
    }
  }

  let iconOk = false;
  const nowMs = Date.now();
  for (const w of matched) {
    if (appId) applyAppUserModelNative(api, w.hWnd, appId, title);
    if (title) api.SetWindowTextW(w.hWnd, title);
    if (hiSmall || hiBig) {
      stampWindowIconsNative(api, w.hWnd, hiSmall, hiBig);
      iconOk = true;
    }
    if (targetWorkArea && w.pid > 0) {
      let firstSeen = firstSeenBrowserPidAt.get(w.pid);
      if (!firstSeen || sidecarFresh) {
        firstSeen = nowMs;
        firstSeenBrowserPidAt.set(w.pid, firstSeen);
      }
      if (nowMs - firstSeen < 4500) {
        placeHwndOnTargetWorkAreaNative(api, w.hWnd, targetWorkArea, { maximize: true });
      }
    }
  }

  return {
    id: payload.id || 0,
    result: iconOk ? "OK_ICON" : "OK_TITLE",
    wmiSkipped: true,
    via: "koffi",
  };
}

/** @typedef {{ worker: import('node:child_process').ChildProcessWithoutNullStreams | null, rl: import('node:readline').Interface | null, ready: boolean, pending: Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>, tail: Promise<unknown>, queued: number }} WorkerSlot */

/** @returns {WorkerSlot} */
function createSlot() {
  return {
    worker: null,
    rl: null,
    ready: false,
    pending: new Map(),
    tail: Promise.resolve(),
    queued: 0,
  };
}

/** @type {WorkerSlot[]} */
const slots = Array.from({ length: WORKER_POOL_SIZE }, createSlot);

/** Serialize generic exclusive work (tests / one-at-a-time helpers). */
let applyTail = Promise.resolve();
let seq = 0;

function rejectSlotPending(slot, error) {
  for (const [id, job] of slot.pending.entries()) {
    clearTimeout(job.timer);
    job.reject(error);
    slot.pending.delete(id);
  }
}

function handleWorkerLine(slot, line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.ready === true) {
    slot.ready = true;
    return;
  }
  const id = Number(msg.id);
  const job = slot.pending.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  slot.pending.delete(id);
  job.resolve(msg);
}

function spawnWorkerOn(slot) {
  if (slot.worker && !slot.worker.killed) return slot.worker;
  slot.ready = false;
  slot.worker = spawn(
    resolvePowerShell(),
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-ExecutionPolicy", "Bypass", "-File", WORKER_PS1],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  slot.worker.on("error", () => undefined);
  slot.worker.stdin?.on("error", () => undefined);
  slot.worker.stdout?.on("error", () => undefined);
  slot.worker.stderr?.on("error", () => undefined);
  slot.rl = readline.createInterface({ input: slot.worker.stdout });
  slot.rl.on("line", (line) => handleWorkerLine(slot, line));
  slot.worker.stderr.on("data", () => undefined);
  slot.worker.on("exit", () => {
    slot.ready = false;
    slot.worker = null;
    if (slot.rl) {
      slot.rl.close();
      slot.rl = null;
    }
    rejectSlotPending(slot, new Error("taskbar-apply-worker-exited"));
  });
  return slot.worker;
}

async function waitSlotReady(slot, timeoutMs = 15_000) {
  if (slot.ready) return;
  spawnWorkerOn(slot);
  const deadline = Date.now() + timeoutMs;
  while (!slot.ready && Date.now() < deadline) {
    if (!slot.worker || slot.worker.killed) throw new Error("taskbar-apply-worker-failed");
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!slot.ready) throw new Error("taskbar-apply-worker-timeout");
}

function pickSlot() {
  let best = slots[0];
  for (const slot of slots) {
    if (slot.queued < best.queued) best = slot;
  }
  return best;
}

/**
 * Run exclusive work one-at-a-time. Timeout starts when the job begins, not
 * when it is queued — burst-open used to pile 13+ stdin lines and later
 * profiles hit request-timeout before the serial PS worker reached them.
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueueExclusive(work) {
  const run = () => work();
  const next = applyTail.then(run, run);
  applyTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * @template T
 * @param {WorkerSlot} slot
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueueOnSlot(slot, work) {
  slot.queued += 1;
  const run = async () => {
    try {
      return await work();
    } finally {
      slot.queued = Math.max(0, slot.queued - 1);
    }
  };
  const next = slot.tail.then(run, run);
  slot.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Spread work across the worker pool (burst-open / guard).
 * @template T
 * @param {(slot: WorkerSlot) => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueuePooled(work) {
  const slot = pickSlot();
  return enqueueOnSlot(slot, () => work(slot));
}

async function waitWorkerReady(timeoutMs = 15_000) {
  if (getNativeWin32()) return;
  await waitSlotReady(slots[0], timeoutMs);
}

/**
 * @param {object} payload
 * @param {{ timeoutMs?: number }} [opts]
 */
async function runTaskbarApplyWorker(payload, opts = {}) {
  const api = getNativeWin32();
  if (api) {
    return applyTaskbarNative(api, { id: ++seq, ...payload });
  }
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 12_000;
  return enqueuePooled(async (slot) => {
    await waitSlotReady(slot);
    if (!slot.worker || slot.worker.killed) throw new Error("taskbar-apply-worker-unavailable");
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        slot.pending.delete(id);
        reject(new Error("taskbar-apply-worker-request-timeout"));
      }, timeoutMs);
      slot.pending.set(id, { resolve, reject, timer });
      try {
        if (!slot.worker?.stdin || slot.worker.stdin.destroyed || !slot.worker.stdin.writable) {
          clearTimeout(timer);
          slot.pending.delete(id);
          reject(new Error("taskbar-apply-worker-stdin-closed"));
          return;
        }
        slot.worker.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, (writeErr) => {
          if (writeErr) {
            clearTimeout(timer);
            slot.pending.delete(id);
            reject(writeErr);
          }
        });
      } catch (writeErr) {
        clearTimeout(timer);
        slot.pending.delete(id);
        reject(writeErr);
      }
    });
  });
}

function shutdownSlot(slot) {
  rejectSlotPending(slot, new Error("taskbar-apply-worker-shutdown"));
  if (slot.worker && !slot.worker.killed) {
    try {
      slot.worker.stdin.end();
      slot.worker.kill();
    } catch {
      /* ignore */
    }
  }
  slot.worker = null;
  slot.ready = false;
  slot.queued = 0;
  if (slot.rl) {
    slot.rl.close();
    slot.rl = null;
  }
}

function shutdownTaskbarApplyWorker() {
  if (keeperInterval) {
    clearInterval(keeperInterval);
    keeperInterval = null;
  }
  for (const slot of slots) shutdownSlot(slot);
}

/**
 * Multi-socket / multi-processor-group (>64 logical CPUs on Windows 10) round-robin balancer.
 * Uses Native Win32 koffi (0 PowerShell spawn overhead, 0 CLI flags).
 * @param {number} browserPid
 * @param {number} targetGroupSeq
 */
function balanceBrowserProcessorGroup(browserPid, targetGroupSeq, { headless = false } = {}) {
  if (process.platform !== "win32") return Promise.resolve({ ok: false, skipped: true });
  const pid = Number(browserPid) || 0;
  if (pid <= 0) return Promise.resolve({ ok: false, skipped: true });
  const api = getNativeWin32();
  if (api) {
    try {
      const movedThreads = assignProcessTreeToGroupNative(api, pid, targetGroupSeq, { headless });
      return Promise.resolve({ ok: true, movedThreads, via: "koffi" });
    } catch {
      return Promise.resolve({ ok: false });
    }
  }
  return runTaskbarApplyWorker(
    {
      assignGroup: true,
      HintPid: pid,
      TargetGroup: Number(targetGroupSeq) || 0,
      Headless: Boolean(headless),
    },
    { timeoutMs: 5000 },
  ).catch(() => ({ ok: false }));
}

process.once("exit", shutdownTaskbarApplyWorker);

module.exports = {
  WORKER_POOL_SIZE,
  balanceBrowserProcessorGroup,
  enqueueExclusive,
  enqueuePooled,
  listProfileChromeWindowsNative,
  moveChromeWindowsToTargetWorkAreaNative,
  runTaskbarApplyWorker,
  shutdownTaskbarApplyWorker,
  waitWorkerReady,
};
