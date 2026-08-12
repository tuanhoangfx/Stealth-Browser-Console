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

**Always import as `@tool-workspace/hub-identity`** — this is the canonical specifier, enforced by
`Tool/scripts/hub-vite-alias-check.mjs` on two fronts:

1. **Alias shape** — a hub tool fails if its vite config is missing the
   `@tool-workspace/hub-identity` index + subpath aliases, or if they don't resolve to
   `vendor/hub-identity/src`. Aliases assembled in a helper module (P0005's
   `scripts/hub-vendor-resolve.mjs`) are followed, so the config is checked as a bundle.
2. **Source imports** — any `from "@dev/hub-identity"` under a tool's `src/`, `app/`, or
   `electron/` fails the gate with the offending `file:line`.

`@dev/hub-identity` is only the **package.json `name`**, deliberately left as-is. It is not an
import convention — do not add new `@dev/hub-identity` import sites. The name is not renamed to
match because `sync-hub-identity-vendor.cjs` mirrors the whole package (including `package.json`)
into 15 `Tool/*/vendor/hub-identity` copies on every `predev`, so a rename would invalidate ~66
`pnpm-lock.yaml` entries and force a reinstall across 13 tools for zero resolution benefit.

How each consumer resolves the canonical specifier:

| Consumer | Mechanism |
|----------|-----------|
| Tools (P0020, P0004, …) | `"@tool-workspace/hub-identity": "file:./vendor/hub-identity"` dep + vite/tsconfig aliases → `vendor/hub-identity/src` |
| `packages/hub-ui` | `"@tool-workspace/hub-identity": "workspace:@dev/hub-identity@*"` devDep → pnpm links `packages/hub-identity`; **no alias needed** |

## Auth storage

Identity Supabase clients use `persistSession: false` — hub cache is the only JWT SSOT (avoids `sb-*` refresh races).
