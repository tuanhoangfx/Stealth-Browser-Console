# E0001 Cookie Bridge (MV3)

Chrome extension — sync browser cookies → P0020-Data-Box Notes (`cookie_snapshot`) via Supabase RPC.

**Current build:** `1.2.17` — live on [Chrome Web Store](https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk). See [CHANGELOG.md](./CHANGELOG.md).

**Sync model:** Route metadata lives in Supabase. **Sync now** publishes the owner/source browser jar → Supabase vault; **Load cookies** applies the latest vault → this browser. Shared/member routes are read-only by default.

**Manual test (when Load cookies does not log in):** Popup → *Test thủ công* → on logged-in browser **Copy JSON (browser)** → on other browser paste → **Apply paste**. Compare with [Cookie-Editor](https://github.com/moustachauve/cookie-editor) export.

Each **Chrome profile** has its own extension runtime cache (JWT, last sync/load). Routes are created in Supabase first, then each linked profile receives them through realtime/cloud refresh. You must **Link extension** once per profile.

## How cookies are read (vs [Cookie-Editor](https://github.com/moustachauve/cookie-editor))

E0001 uses the same Chrome API as Cookie-Editor:

1. **`chrome.cookies.getAll({ domain })`** — query by `.facebook.com`, `facebook.com`, `www.facebook.com`, etc., dedupe by name+domain+path.
2. **Fallback** — scan all cookies and filter by domain suffix if host variants return nothing.
3. **Sync (snapshot)** — masked lines (`name = abcd…wxyz`) via Supabase RPC.
4. **Vault** — full name/value/domain/path/secure/httpOnly/sameSite/expiration JSON, AES-GCM encrypted, then **`chrome.cookies.set`** on Load (no `storeId` cross-profile; normalizes `sameSite`; `__Host-` rules).

Cookie-Editor is manual edit/export; E0001 automates export → cloud vault → apply on another profile.

### Why Tool “cookie lines” look different from Cookie-Editor JSON

| What you see | Format | Can log in? |
|--------------|--------|-------------|
| Tool note / extension **Snapshot** column | `name = abcd…wxyz` (masked) | **No** — audit only |
| **Vault** (encrypted in Supabase) | Full JSON like Cookie-Editor | **Yes** — use popup **Load cookies** |
| Cookie-Editor export | Full JSON in clipboard | **Yes** — import in Settings (0.5.5+) or manual |

Short values (`ps_l = 1`) show as `••••••••` in snapshot because masking hides values ≤8 chars; vault still stores `1`.

## Cookies vs OAuth vs “session” (durability)

| Approach | Bền vững | Ghi chú |
|----------|----------|---------|
| **OAuth / refresh token** (official) | Cao nhất | Token hết hạn, thu hồi được; cần API partner — Facebook/Google không cho app random. |
| **HttpOnly session cookie** (vault sync) | Trung bình–cao | Cách E0001 đang làm: giống copy session; hết hạn khi server logout / rotate; phụ thuộc site. |
| **Masked snapshot only** | Thấp | Không login được; chỉ audit/debug. |

Khuyến nghị E0001: **vault + Sync** cho cross-browser login nội bộ; lâu dài nếu có API chính thức thì thêm OAuth.

## Install

**Chrome Web Store (recommended):** [Install E0001 Cookie Bridge](https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk) → open Data Box Cookie Bridge → **Link extension**.

**Without Chrome Web Store:** download ZIP from [GitHub Releases](https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/latest) → extract → `chrome://extensions` → Developer mode → **Load unpacked**.

Details: [docs/INSTALL.md](./docs/INSTALL.md)

**Developer (this repo):**

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
2. Select `E:\Dev\Extension\E0001-cookie-bridge`

Package ZIP: `.\scripts\package-extension.ps1`

## Workflow (with P0020-Data-Box)

1. Open **P0020-Data-Box** → create/select a Note to get `note_id`.
2. **Cookie sync** → create a route with `note_id`, domain, and optional sync pass. The route is saved directly to Supabase.
3. **Link extension** once per Chrome profile so the runtime cache receives accessible routes.
4. **Sync now** — owner/source only; exports cookies from this browser → Note snapshot + Supabase vault version.
5. **Load cookies** — read-only/member safe; imports full cookies from vault → this browser.

### Cross-browser (V4 vault)

| Step | Browser A | Browser B |
|------|-----------|-----------|
| 1 | Create cloud route + Link extension | Link extension (same account or shared access) |
| 2 | **Sync now** (jar → vault) | Route appears from cloud/realtime |
| 3 | Optional future auto-sync interval | **Load cookies** (vault → jar, tự mở `www.facebook.com`) |

Ai **Sync** sau cùng thì vault trên Supabase là bản của browser đó. Ai **Load** thì nhận vault mới nhất.

Masked snapshot alone cannot log you in — use **vault** + pass.

## Storage

| Layer | What |
|-------|------|
| Extension `chrome.storage.local` | `syncId`, `domain`, optional `pass` (bindings) |
| Supabase `notes.cookie_snapshot` | Masked lines only (`name = abcd…wxyz`) |
| Supabase `note_cookie_vault` | AES-GCM jar — **Load cookies** reads this |
| Supabase `notes.sync_pass_hash` | Optional bcrypt — set on note in Notes UI |

RPC: `note_sync_cookies(p_sync_id, p_pass, p_snapshot, p_domain)` — no user JWT required when sync pass is configured.

## Files

- `content-bridge.js` — postMessage from web app (auth, bindings, prefs, sync)
- `background.js` — alarms, `chrome.cookies`, Supabase REST/RPC
- `options.html` + `options.js` — manual binding editor (fallback; **no inline script** — MV3 CSP)

## Dev origin

`http://127.0.0.1:5177` (local), `https://databox.infi28.com` (production — API planes `https://hub-api.infi28.com` & `https://sb-api.infi28.com`), and legacy `*.infi.io.vn` / `*.vercel.app`.
