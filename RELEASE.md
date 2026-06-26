# Release log — Stealth Browser Console

## Desktop release workflow (v0.7.3+)

**Default:** NSIS installer only (no portable — saves ~3–5 min). Close Stealth Browser before packaging.

| Goal | Command | Time |
|------|---------|------|
| Dev UI build | `pnpm build` | ~30s |
| Fast gates | `pnpm test:fast` | ~2–3 min |
| Full gates (major release) | `pnpm test:unit` | ~8 min |
| Local installer (no upload) | `pnpm desktop:dist` | ~5 min |
| **Publish GitHub Release** | see below | ~6 min |

```powershell
cd E:\Dev\Tool\P0003-Stealth-Browser-Console
$env:GH_TOKEN = (gh auth token)
powershell -File scripts/release-desktop.ps1 -Publish -SkipInstall -FastTests
```

| Flag | Effect |
|------|--------|
| `-FastTests` | Skip live CloakBrowser e2e smokes |
| `-SkipInstall` | Skip `pnpm install` when lockfile unchanged |
| `-SkipBuild` | Skip VS/sqlite rebuild in script (package step still builds UI if needed) |
| `-WithPortable` | Also build portable exe (slower) |

**Pre-release:** `scripts/pre-release-desktop.ps1` stops Stealth processes (avoids `EBUSY` on `dist-desktop`).

**After publish:** `verify-github-release-assets.mjs` checks Setup.exe + `latest.yml` on GitHub; single `gh release upload` (electron-builder `--publish never` avoids duplicate releases per tag); `dedupe-github-releases.mjs` cleans legacy duplicates.

**Latest release:** [v0.7.3](https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.3)

---

## v0.4.5 — AG Appeal + Steps Hub-UI (2026-06-17)

- Google Forms AG Appeal workflow runs via script-steps engine
- Profiles header aligned with Scripts (`WorkspaceTabHeader`)
- Workflow Steps editor restyled to Hub-UI tokens

### Rollback

```powershell
git checkout v0.4.5 -- Tool/P0003-Stealth-Browser-Console
```

## v0.4.4 — Launch workflow + tighter gutters (2026-06-17)

- Launch chạy theo workflow active ở rail; double-click profile vẫn mở startup/default
- Giảm gutter hai mép frame (padding `0.75rem`)

### Rollback

```powershell
git checkout v0.4.4 -- Tool/P0003-Stealth-Browser-Console
```

## v0.4.3 — Remove label extension (2026-06-17)

- Gỡ hoàn toàn extension hiển thị nhãn + tab groups (xóa extension + IPC/settings liên quan)
- Startup URL ưu tiên tab mặc định (wait page event trước khi fallback mở tab mới)

### Rollback

```powershell
git checkout v0.4.3 -- Tool/P0003-Stealth-Browser-Console
```

## v0.4.2 — Startup tab polish (2026-06-17)

- Startup URL chạy ngay tab mặc định (không tạo tab mới)

### Rollback

```powershell
git checkout v0.4.2 -- Tool/P0003-Stealth-Browser-Console
```

## v0.4.1 — Chrome defaults + Hub polish (2026-06-17)

- Tắt auto Chrome tab groups mặc định (vẫn giữ badge label)
- Chỉnh gutter/padding để header flush như Hub (P0004)
- Đồng bộ version theo rule (`package.json`, `tool.manifest.json`, `APP_VERSION`)

### Rollback

```powershell
git checkout v0.4.1 -- Tool/P0003-Stealth-Browser-Console
```

## v0.4.0 — Shell / Settings (2026-06-14)

- Cửa sổ mở maximized mặc định
- Settings: panel Browser defaults (OS/preset/tz/locale/color) áp cho profile mới + Appearance
- Xóa dead screen History (run-history orphan); nav = Profiles + Workflow, Settings ở footer

### Rollback

```powershell
git checkout v0.4.0 -- Tool/P0003-Stealth-Browser-Console
```

## v0.3.0 — Device library / antidetect (2026-06-14)

- Kho thiết bị coherent + chọn OS độc lập host (windows/macos/linux)
- Per-profile timezone/locale/viewport/color-scheme/UA (cloakbrowser-honored), WebRTC mask auto
- DB migration cộng cột device; modal create/edit có section Device · Fingerprint
- Đạt trần năng lực engine; gap còn lại (mobile/Firefox, per-field GPU, version pin) là giới hạn cloakbrowser
- ⚠️ Trước phát hành: `pnpm dist` trên máy có cert + smoke test bản cài

### Rollback

```powershell
git checkout v0.3.0 -- Tool/P0003-Stealth-Browser-Console
```

## v0.2.0 — Workflow fix + security hardening (2026-06-14)

- Fix crash trắng-app do vendor drift hub-ui (column width SSOT) → Workflow tab chạy lại
- Security: bỏ hardcode proxy creds, chống SSRF `router:request`, validate IPC, `sandbox:true` + CSP packaged
- Refactor: rename `Gpm*` → `Stealth*`, gỡ file/code trùng lặp
- ⚠️ Trước khi phát hành: chạy `pnpm dist` trên máy có cert + smoke test bản cài (xác nhận CSP không gây trắng màn renderer)

### Rollback

```powershell
git checkout v0.2.0 -- Tool/P0003-Stealth-Browser-Console
```

## v0.1.0 — MVP (2026-06-13)

- Greenfield P0003: CloakBrowser + SQLite + Hub-UI shell
- Profiles directory, Open URL rail, run history, console
- Settings: engine health, theme, data folder

### Rollback

```powershell
git checkout v0.1.0 -- Tool/P0003-Stealth-Browser-Console
```
