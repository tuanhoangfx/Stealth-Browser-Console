# CloakBrowser Engine Policy (`P0003`)

## Bump Policy (`#bump-policy`)

- **Frozen Wrapper Version:** `cloakbrowser@0.4.8`
- **Frozen Chromium Binary:** `chromium-146.0.7680.177.5` (`windows-x64`, `tier: "free"`)
- **Auto-Update Disabled:** `CLOAKBROWSER_AUTO_UPDATE=false` and `CLOAKBROWSER_VERSION=146.0.7680.177.5` are enforced at module load in `electron/engine/cloak-browser-engine.cjs`.

### Why `0.4.8` (`chromium-146.0.7680.177.5`) Is Frozen

1. **No Concurrent Session / Seat Limit (`exitCode=76`):**
   - `cloakbrowser@0.4.8` (`chromium-146.0.7680.177.5`) runs 100% locally without online license validation or concurrent session caps.
   - Starting in `0.4.11` and enforced strictly in `0.7.0` (`chromium-148.0.7778.215.2-pro`), CloakHQ requires `claimFreeKey()` + online license validation and enforces `exitCode=76` (`CloakBrowser Pro: session limit reached for your plan`), which blocks multi-profile fleet execution.
2. **All Modern Wrapper Antidetect Fixes Backported:**
   - Hardware WebGL ANGLE (`--ignore-gpu-blocklist` on Windows in both Headed and Headless modes, no `--disable-gpu`, no `SwiftShader`).
   - Coherent Headless Viewport (`1920×947` / `1920×1080` screen geometry; `viewport: null` only when `windowMode === "host-maximized"` and `!headless`).
   - Deterministic per-profile `--fingerprint=<seed>` persisted in SQLite.
3. **Local Mirror Backup & Self-Restore:**
   - Local frozen archive: `~/.cloakbrowser/backups/cloakbrowser-windows-x64-146.0.7680.177.5.zip` (`.sha256.json`).
   - If `~/.cloakbrowser/chromium-146.0.7680.177.5/chrome.exe` is missing, `cloak-browser-engine.cjs` restores it automatically from the local mirror archive before attempting any network download.
