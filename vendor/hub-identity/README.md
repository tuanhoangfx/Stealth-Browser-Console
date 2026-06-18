# @dev/hub-identity

Canonical SSOT for Tool Hub JWT cache, dual sign-in, and workspace auth boot.

## Layout

| Path | Role |
|------|------|
| `packages/hub-identity` | **Canonical** — edit here |
| `Tool/*/vendor/hub-identity` | Vendored copies for each tool |
| `x1z10:hub-identity-v2` | Browser localStorage JWT (cross-tab) |

## Sync to tools

```bash
node Tool/scripts/sync-hub-identity-vendor.cjs
node Tool/scripts/hub-identity-vendor-hash-check.mjs
```

## Import

Prefer `@dev/hub-identity`. Legacy `@tool-workspace/hub-identity` alias remains in vite/tsconfig.

## Auth storage

Identity Supabase clients use `persistSession: false` — hub cache is the only JWT SSOT (avoids `sb-*` refresh races).
