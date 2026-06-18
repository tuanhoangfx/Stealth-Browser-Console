# Hub UI table patterns

> **Deprecated:** merged into [`UI_PATTERNS.md`](./UI_PATTERNS.md) + `Tool/schemas/ui-patterns.catalog.json`. Kept for reference only.

Agent tab → Kind **Pattern** + Layer **Table part** (was Kind Table).

**Catalog:** `Tool/schemas/ui-patterns.catalog.json`  
**Legacy:** `ui-tables.catalog.json`

---

## Patterns (4)

| ID | Name | Golden (mẫu) | Clones (instance) |
|----|------|--------------|-------------------|
| `directory` | **Directory** | P0004 **`HubListPage`** (+ ViewToggle card/table) | clones — see `ui-patterns` |
| `wide-metrics-table` | *(composed in System)* | Supabase quota panel | — |
| `meta-list-table` | *(composed in System)* | Agent panel | — |
| `panel-links-table` | *(composed in Overview + TOC)* | ToolLinksTable | — |

Channels (P0006) = **directory clone** (card grid only today; same pattern when table is added).

---

## Directory — golden vs clone

**Golden (chuẩn — sửa pattern ở đây):**

- Screen: `Tool/P0004-Tool-Hub/src/features/hub/HubListPage.tsx`
- Table: `Tool/P0004-Tool-Hub/src/features/hub/HubToolsDirectoryTable.tsx`
- Skin: `hub-users-table` + `hub-users-table-wrap`

**Composed chrome (không tách component riêng):** AppTabHeader, FilterBar, ViewToggle, DisplayPrefs, KPI.

**Clone (đổi data/columns, giữ chrome + skin):** xem `ui-patterns.catalog.json` → pattern `directory`.

**Không** tạo Agent row “Bots directory” — chỉ **Directory** + cột Clone.

**document-toc:** Kind **Screen** → `Overview + TOC left` (golden `P0004/overview-toc`). Bảng links → Kind **Table** → **Panel links table**.

---

## Clone command

```bash
node E:/Dev/Tool/scripts/hub-ui-stack.cjs P00xx <screen>
node E:/Dev/Tool/scripts/hub-ui-parity-check.mjs --code P00xx --screen <screen> --template directory
```

Compare :5176 Hub table view vs target.

---

## Related

- [UI_TEMPLATES.md](./UI_TEMPLATES.md) — screen template `directory`
- [UI_COMPONENTS.md](./UI_COMPONENTS.md) — FilterBar, ViewToggle
