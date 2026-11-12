/**
 * Zero-PowerShell Native Taskbar Badge Renderer (Design V4) via koffi (user32 + gdi32 + gdiplus) + node:zlib PNG.
 * Replaces spawning `powershell.exe -File render-taskbar-badge.ps1` (~800–2000ms + .NET GDI+ + temp PNG disk churn)
 * with in-memory native GDI+ rendering (~2–5ms warm, 0 child processes, 0 temp files).
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function bgraToPngBuffer(bgra, width, height) {
  const rowBytes = width * 4 + 1;
  const raw = Buffer.allocUnsafe(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const dstRow = y * rowBytes;
    const srcRow = y * width * 4;
    raw[dstRow] = 0; // Filter: None
    for (let x = 0; x < width; x += 1) {
      const s = srcRow + x * 4;
      const d = dstRow + 1 + x * 4;
      // GDI+ PixelFormat32bppARGB stores straight [B, G, R, A] in little-endian memory
      raw[d] = bgra[s + 2];
      raw[d + 1] = bgra[s + 1];
      raw[d + 2] = bgra[s];
      raw[d + 3] = bgra[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // Color type 6: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

let gdiRenderApi = null;
let gdiRenderInitTried = false;
/** @type {Map<string, { size: number, bgra: Buffer }>} */
const baseIconPixelsCache = new Map();

function resolveKoffi() {
  try {
    if (globalThis.__STEALTH_ORPHAN_NATIVE_API__?.koffi) {
      return globalThis.__STEALTH_ORPHAN_NATIVE_API__.koffi;
    }
  } catch {
    /* ignore */
  }
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
      return require(cand);
    } catch {
      /* try next */
    }
  }
  return null;
}

function getGdiBadgeRenderApi() {
  if (process.platform !== "win32") return null;
  if (globalThis.__STEALTH_BADGE_GDIPLUS_API__) return globalThis.__STEALTH_BADGE_GDIPLUS_API__;
  if (gdiRenderInitTried) return gdiRenderApi;
  gdiRenderInitTried = true;
  const koffi = resolveKoffi();
  if (!koffi) return null;
  try {
    const user32 = koffi.load("user32.dll");
    const gdi32 = koffi.load("gdi32.dll");
    const gdiplus = koffi.load("gdiplus.dll");
    const suffix = `_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const startupStructName = `GdiplusStartupInput${suffix}`;
    const rectFName = `RectF_Badge${suffix}`;
    const iconInfoName = `ICONINFO_Badge${suffix}`;
    const bmiName = `BITMAPINFOHEADER_Badge${suffix}`;

    koffi.struct(startupStructName, {
      GdiplusVersion: "uint32_t",
      DebugEventCallback: "uintptr_t",
      SuppressBackgroundThread: "int32_t",
      SuppressExternalCodecs: "int32_t",
    });
    koffi.struct(rectFName, {
      X: "float",
      Y: "float",
      Width: "float",
      Height: "float",
    });
    koffi.struct(iconInfoName, {
      fIcon: "int32_t",
      xHotspot: "uint32_t",
      yHotspot: "uint32_t",
      hbmMask: "uintptr_t",
      hbmColor: "uintptr_t",
    });
    koffi.struct(bmiName, {
      biSize: "uint32_t",
      biWidth: "int32_t",
      biHeight: "int32_t",
      biPlanes: "uint16_t",
      biBitCount: "uint16_t",
      biCompression: "uint32_t",
      biSizeImage: "uint32_t",
      biXPelsPerMeter: "int32_t",
      biYPelsPerMeter: "int32_t",
      biClrUsed: "uint32_t",
      biClrImportant: "uint32_t",
    });

    const GdiplusStartup = gdiplus.func(
      `int __stdcall GdiplusStartup(_Out_ uintptr_t*, const ${startupStructName}*, uintptr_t)`,
    );
    const tokenOut = [0];
    const status = GdiplusStartup(
      tokenOut,
      {
        GdiplusVersion: 1,
        DebugEventCallback: 0,
        SuppressBackgroundThread: 0,
        SuppressExternalCodecs: 0,
      },
      0,
    );
    if (status !== 0 || !tokenOut[0]) return null;

    gdiRenderApi = {
      token: tokenOut[0],
      PrivateExtractIconsW: user32.func(
        "uint32_t __stdcall PrivateExtractIconsW(str16, int, int, int, _Out_ uintptr_t*, _Out_ uint32_t*, uint32_t, uint32_t)",
      ),
      GetIconInfo: user32.func(`bool __stdcall GetIconInfo(uintptr_t, _Out_ ${iconInfoName}*)`),
      DestroyIcon: user32.func("bool __stdcall DestroyIcon(uintptr_t)"),
      CreateCompatibleDC: gdi32.func("uintptr_t __stdcall CreateCompatibleDC(uintptr_t)"),
      DeleteDC: gdi32.func("bool __stdcall DeleteDC(uintptr_t)"),
      DeleteObject: gdi32.func("bool __stdcall DeleteObject(uintptr_t)"),
      GetDIBits: gdi32.func(
        `int __stdcall GetDIBits(uintptr_t, uintptr_t, uint32_t, uint32_t, void*, _Inout_ ${bmiName}*, uint32_t)`,
      ),
      GdipCreateBitmapFromScan0: gdiplus.func(
        "int __stdcall GdipCreateBitmapFromScan0(int, int, int, int, void*, _Out_ uintptr_t*)",
      ),
      GdipDisposeImage: gdiplus.func("int __stdcall GdipDisposeImage(uintptr_t)"),
      GdipGetImageGraphicsContext: gdiplus.func(
        "int __stdcall GdipGetImageGraphicsContext(uintptr_t, _Out_ uintptr_t*)",
      ),
      GdipDeleteGraphics: gdiplus.func("int __stdcall GdipDeleteGraphics(uintptr_t)"),
      GdipGraphicsClear: gdiplus.func("int __stdcall GdipGraphicsClear(uintptr_t, uint32_t)"),
      GdipDrawImageRectI: gdiplus.func(
        "int __stdcall GdipDrawImageRectI(uintptr_t, uintptr_t, int, int, int, int)",
      ),
      GdipSetCompositingMode: gdiplus.func("int __stdcall GdipSetCompositingMode(uintptr_t, int)"),
      GdipSetInterpolationMode: gdiplus.func("int __stdcall GdipSetInterpolationMode(uintptr_t, int)"),
      GdipSetPixelOffsetMode: gdiplus.func("int __stdcall GdipSetPixelOffsetMode(uintptr_t, int)"),
      GdipSetTextRenderingHint: gdiplus.func("int __stdcall GdipSetTextRenderingHint(uintptr_t, int)"),
      GdipCreateFontFamilyFromName: gdiplus.func(
        "int __stdcall GdipCreateFontFamilyFromName(str16, uintptr_t, _Out_ uintptr_t*)",
      ),
      GdipDeleteFontFamily: gdiplus.func("int __stdcall GdipDeleteFontFamily(uintptr_t)"),
      GdipCreateFont: gdiplus.func(
        "int __stdcall GdipCreateFont(uintptr_t, float, int, int, _Out_ uintptr_t*)",
      ),
      GdipDeleteFont: gdiplus.func("int __stdcall GdipDeleteFont(uintptr_t)"),
      GdipStringFormatGetGenericTypographic: gdiplus.func(
        "int __stdcall GdipStringFormatGetGenericTypographic(_Out_ uintptr_t*)",
      ),
      GdipCloneStringFormat: gdiplus.func(
        "int __stdcall GdipCloneStringFormat(uintptr_t, _Out_ uintptr_t*)",
      ),
      GdipDeleteStringFormat: gdiplus.func("int __stdcall GdipDeleteStringFormat(uintptr_t)"),
      GdipSetStringFormatAlign: gdiplus.func("int __stdcall GdipSetStringFormatAlign(uintptr_t, int)"),
      GdipSetStringFormatLineAlign: gdiplus.func(
        "int __stdcall GdipSetStringFormatLineAlign(uintptr_t, int)",
      ),
      GdipSetStringFormatFlags: gdiplus.func("int __stdcall GdipSetStringFormatFlags(uintptr_t, int)"),
      GdipSetStringFormatTrimming: gdiplus.func(
        "int __stdcall GdipSetStringFormatTrimming(uintptr_t, int)",
      ),
      GdipCreateSolidFill: gdiplus.func(
        "int __stdcall GdipCreateSolidFill(uint32_t, _Out_ uintptr_t*)",
      ),
      GdipDeleteBrush: gdiplus.func("int __stdcall GdipDeleteBrush(uintptr_t)"),
      GdipMeasureString: gdiplus.func(
        `int __stdcall GdipMeasureString(uintptr_t, str16, int, uintptr_t, const ${rectFName}*, uintptr_t, _Out_ ${rectFName}*, uintptr_t, uintptr_t)`,
      ),
      GdipDrawString: gdiplus.func(
        `int __stdcall GdipDrawString(uintptr_t, str16, int, uintptr_t, const ${rectFName}*, uintptr_t, uintptr_t)`,
      ),
    };
    globalThis.__STEALTH_BADGE_GDIPLUS_API__ = gdiRenderApi;
  } catch {
    gdiRenderApi = null;
  }
  return gdiRenderApi;
}

function extractExeIconBgra(api, exePath, targetSize) {
  const st = fs.statSync(exePath);
  const cacheKey = `${exePath}|${st.mtimeMs}|${targetSize}`;
  const cached = baseIconPixelsCache.get(cacheKey);
  if (cached) return cached;

  const hIconOut = [0];
  const iconIdOut = [0];
  const count = api.PrivateExtractIconsW(
    exePath,
    0,
    targetSize,
    targetSize,
    hIconOut,
    iconIdOut,
    1,
    0,
  );
  if (!count || !hIconOut[0]) {
    throw new Error("PrivateExtractIconsW failed to extract Chromium icon");
  }
  const hIcon = hIconOut[0];
  const ii = {};
  let hdc = 0;
  try {
    if (!api.GetIconInfo(hIcon, ii) || !ii.hbmColor) {
      throw new Error("GetIconInfo failed on Chromium HICON");
    }
    hdc = api.CreateCompatibleDC(0);
    if (!hdc) throw new Error("CreateCompatibleDC failed");
    const bgra = Buffer.alloc(targetSize * targetSize * 4);
    const bmi = {
      biSize: 40,
      biWidth: targetSize,
      biHeight: -targetSize, // top-down DIB
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0, // BI_RGB
      biSizeImage: bgra.length,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };
    const scanLines = api.GetDIBits(hdc, ii.hbmColor, 0, targetSize, bgra, bmi, 0);
    if (scanLines <= 0) {
      throw new Error("GetDIBits returned 0 scanlines");
    }
    const entry = { size: targetSize, bgra };
    if (baseIconPixelsCache.size >= 8) baseIconPixelsCache.clear();
    baseIconPixelsCache.set(cacheKey, entry);
    return entry;
  } finally {
    if (ii.hbmMask) api.DeleteObject(ii.hbmMask);
    if (ii.hbmColor) api.DeleteObject(ii.hbmColor);
    if (hdc) api.DeleteDC(hdc);
    api.DestroyIcon(hIcon);
  }
}

const PIXEL_FORMAT_32BPP_ARGB = 0x0026200a;
const HALO_OFFSETS = [
  [1.0, 0.0],
  [-1.0, 0.0],
  [0.0, 1.0],
  [0.0, -1.0],
];

function drawPackedBoldDigitsNative(api, gfx, text, textY, textH, canvasW, fontSize, maxKern, digitGap, digitArgb) {
  const famOut = [0];
  const fontOut = [0];
  const sfGenericOut = [0];
  const sfOut = [0];
  const haloBrushOut = [0];
  const fillBrushOut = [0];
  try {
    if (api.GdipCreateFontFamilyFromName("Segoe UI", 0, famOut) !== 0 || !famOut[0]) {
      throw new Error("GdipCreateFontFamilyFromName(Segoe UI) failed");
    }
    // FontStyleBold = 1, UnitPixel = 2
    if (api.GdipCreateFont(famOut[0], fontSize, 1, 2, fontOut) !== 0 || !fontOut[0]) {
      throw new Error("GdipCreateFont failed");
    }
    if (api.GdipStringFormatGetGenericTypographic(sfGenericOut) !== 0 || !sfGenericOut[0]) {
      throw new Error("GdipStringFormatGetGenericTypographic failed");
    }
    if (api.GdipCloneStringFormat(sfGenericOut[0], sfOut) !== 0 || !sfOut[0]) {
      throw new Error("GdipCloneStringFormat failed");
    }
    api.GdipSetStringFormatAlign(sfOut[0], 1); // Center
    api.GdipSetStringFormatLineAlign(sfOut[0], 0); // Near
    api.GdipSetStringFormatFlags(sfOut[0], 0x1000); // StringFormatFlagsNoWrap
    api.GdipSetStringFormatTrimming(sfOut[0], 0); // None
    api.GdipSetTextRenderingHint(gfx, 5); // ClearTypeGridFit

    api.GdipCreateSolidFill(0xc8000000 >>> 0, haloBrushOut);
    api.GdipCreateSolidFill(digitArgb >>> 0, fillBrushOut);

    const n = Math.min(3, String(text || "").length);
    const widths = [];
    const layoutInfinite = { X: 0, Y: 0, Width: 10000, Height: 1000 };
    for (let i = 0; i < n; i += 1) {
      const ch = text.slice(i, i + 1);
      const box = { X: 0, Y: 0, Width: 0, Height: 0 };
      api.GdipMeasureString(gfx, ch, 1, fontOut[0], layoutInfinite, sfOut[0], box, 0, 0);
      widths.push(Number(box.Width) || 0);
    }

    const totalW = widths.reduce((acc, w) => acc + w, 0);
    const gapCount = Math.max(0, n - 1);
    const extraGap = gapCount * digitGap;
    const needW = totalW + extraGap;
    let kern = 0;
    if (gapCount > 0 && needW > canvasW) {
      kern = Math.min(maxKern, (needW - canvasW) / gapCount + 0.4);
    }
    const packedW = needW - kern * gapCount;
    let x = (canvasW - packedW) / 2.0;

    for (let i = 0; i < n; i += 1) {
      const w = widths[i];
      const ch = text.slice(i, i + 1);
      for (const [ox, oy] of HALO_OFFSETS) {
        api.GdipDrawString(
          gfx,
          ch,
          1,
          fontOut[0],
          { X: x + ox, Y: textY + oy, Width: w, Height: textH },
          sfOut[0],
          haloBrushOut[0],
        );
      }
      api.GdipDrawString(
        gfx,
        ch,
        1,
        fontOut[0],
        { X: x, Y: textY, Width: w, Height: textH },
        sfOut[0],
        fillBrushOut[0],
      );
      if (i < n - 1) x += w - kern + digitGap;
      else x += w;
    }
  } finally {
    if (fillBrushOut[0]) api.GdipDeleteBrush(fillBrushOut[0]);
    if (haloBrushOut[0]) api.GdipDeleteBrush(haloBrushOut[0]);
    if (sfOut[0]) api.GdipDeleteStringFormat(sfOut[0]);
    if (fontOut[0]) api.GdipDeleteFont(fontOut[0]);
    if (famOut[0]) api.GdipDeleteFontFamily(famOut[0]);
  }
}

/**
 * Render Design V4 taskbar badge PNG frames in memory via native GDI+ (0 PowerShell spawns).
 * Returns `null` only when native koffi GDI+ bindings are unavailable on the host.
 * @param {{
 *   chromeExe: string,
 *   digits: string,
 *   dR: number,
 *   dG: number,
 *   dB: number,
 *   sizes: number[],
 *   digitGapForSize?: (size: number) => number,
 * }} params
 * @returns {Array<{ width: number, height: number, buffer: Buffer }> | null}
 */
function renderBadgePngFramesNative({ chromeExe, digits, dR, dG, dB, sizes, digitGapForSize }) {
  const api = getGdiBadgeRenderApi();
  if (!api) return null;
  if (!chromeExe || !fs.existsSync(chromeExe)) {
    throw new Error("chromium exe not found");
  }
  const cleanSizes = (sizes || []).map(Number).filter((s) => Number.isInteger(s) && s > 0);
  if (!cleanSizes.length) throw new Error("renderBadgePngFramesNative: empty sizes");

  const maxSize = Math.max(...cleanSizes, 48);
  const baseIcon = extractExeIconBgra(api, chromeExe, maxSize);
  const digitArgb =
    ((0xff << 24) | ((dR & 0xff) << 16) | ((dG & 0xff) << 8) | (dB & 0xff)) >>> 0;

  const baseBmpOut = [0];
  if (
    api.GdipCreateBitmapFromScan0(
      baseIcon.size,
      baseIcon.size,
      baseIcon.size * 4,
      PIXEL_FORMAT_32BPP_ARGB,
      baseIcon.bgra,
      baseBmpOut,
    ) !== 0 ||
    !baseBmpOut[0]
  ) {
    throw new Error("GdipCreateBitmapFromScan0(baseIcon) failed");
  }

  const frames = [];
  try {
    for (const size of cleanSizes) {
      const scan0 = Buffer.alloc(size * size * 4);
      const bmpOut = [0];
      const gfxOut = [0];
      try {
        if (
          api.GdipCreateBitmapFromScan0(
            size,
            size,
            size * 4,
            PIXEL_FORMAT_32BPP_ARGB,
            scan0,
            bmpOut,
          ) !== 0 ||
          !bmpOut[0]
        ) {
          throw new Error(`GdipCreateBitmapFromScan0(${size}) failed`);
        }
        if (api.GdipGetImageGraphicsContext(bmpOut[0], gfxOut) !== 0 || !gfxOut[0]) {
          throw new Error(`GdipGetImageGraphicsContext(${size}) failed`);
        }
        const gfx = gfxOut[0];
        api.GdipSetCompositingMode(gfx, 1); // SourceCopy
        api.GdipGraphicsClear(gfx, 0x00000000);
        api.GdipSetCompositingMode(gfx, 0); // SourceOver
        if (size === baseIcon.size) {
          api.GdipSetInterpolationMode(gfx, 5); // NearestNeighbor
          api.GdipSetPixelOffsetMode(gfx, 4); // Half
        } else {
          api.GdipSetInterpolationMode(gfx, 7); // HighQualityBicubic
          api.GdipSetPixelOffsetMode(gfx, 2); // HighQuality
        }
        api.GdipDrawImageRectI(gfx, baseBmpOut[0], 0, 0, size, size);

        let zoneFrac;
        let fontSize;
        let maxKern;
        let digitGap;
        let bottomPad;
        if (size <= 16) {
          zoneFrac = 0.42;
          fontSize = 10.0;
          maxKern = 4.0;
          digitGap = 2.52;
          bottomPad = 0.25;
        } else if (size <= 20) {
          zoneFrac = 0.4;
          fontSize = 12.0;
          maxKern = 3.5;
          digitGap = 2.99;
          bottomPad = 0.35;
        } else if (size <= 24) {
          zoneFrac = 0.38;
          fontSize = 14.0;
          maxKern = 2.5;
          digitGap = 3.46;
          bottomPad = 0.5;
        } else if (size <= 32) {
          zoneFrac = 0.36;
          fontSize = 17.0;
          maxKern = 1.5;
          digitGap = 4.39;
          bottomPad = 0.75;
        } else if (size <= 48) {
          zoneFrac = 0.34;
          fontSize = 22.0;
          maxKern = 0.0;
          digitGap = 5.33;
          bottomPad = 1.0;
        } else {
          zoneFrac = 0.32;
          fontSize = Math.round(size * 0.42 * 10) / 10;
          maxKern = 0.0;
          digitGap = Math.round(size * 0.112 * 10) / 10;
          bottomPad = 1.25;
        }
        if (typeof digitGapForSize === "function") {
          const overrideGap = Number(digitGapForSize(size));
          if (Number.isFinite(overrideGap)) digitGap = overrideGap;
        }

        const zoneH = Math.max(Math.trunc(fontSize + 2), Math.round(size * zoneFrac));
        const textY = Math.max(0, size - bottomPad - zoneH);
        drawPackedBoldDigitsNative(
          api,
          gfx,
          digits,
          textY,
          zoneH,
          size,
          fontSize,
          maxKern,
          digitGap,
          digitArgb,
        );
      } finally {
        if (gfxOut[0]) api.GdipDeleteGraphics(gfxOut[0]);
        if (bmpOut[0]) api.GdipDisposeImage(bmpOut[0]);
      }
      frames.push({
        width: size,
        height: size,
        buffer: bgraToPngBuffer(scan0, size, size),
      });
    }
  } finally {
    if (baseBmpOut[0]) api.GdipDisposeImage(baseBmpOut[0]);
  }
  return frames;
}

module.exports = {
  getGdiBadgeRenderApi,
  renderBadgePngFramesNative,
  bgraToPngBuffer,
};
