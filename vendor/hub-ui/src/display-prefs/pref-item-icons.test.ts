import { describe, expect, it } from "vitest";
import { Database, Play } from "lucide-react";
import {
  buildDirectoryColumnItemsFromHeaderMeta,
  buildDirectoryColumnItemsFromRoles,
  prefIconMapFromDirectoryColumnHeaderMeta,
  withDirectoryColumnIcons,
  withPrefItemIcons,
} from "./pref-item-icons";
import type { DirectoryColumnHeaderMeta } from "../lib/directory-column-meta-helpers";

describe("withPrefItemIcons", () => {
  it("merges icon metadata by key", () => {
    const rows = withPrefItemIcons(
      [
        { key: "running", label: "Running" },
        { key: "total", label: "Profiles" },
      ],
      {
        running: { icon: Play, iconClassName: "text-emerald-400" },
        total: { icon: Database, iconClassName: "text-indigo-300" },
      },
    );
    expect(rows[0]?.icon).toBe(Play);
    expect(rows[0]?.iconClassName).toBe("text-emerald-400");
    expect(rows[1]?.label).toBe("Profiles");
  });
});

describe("withDirectoryColumnIcons", () => {
  it("preserves required flag while attaching icons", () => {
    const rows = withDirectoryColumnIcons(
      [{ key: "profile", label: "Profile", required: true }],
      { profile: { icon: Database } },
    );
    expect(rows[0]?.required).toBe(true);
    expect(rows[0]?.icon).toBe(Database);
  });

  it("attaches emoji when icon is absent", () => {
    const rows = withDirectoryColumnIcons([{ key: "date", label: "Date" }], { date: { emoji: "📅" } });
    expect(rows[0]?.emoji).toBe("📅");
    expect(rows[0]?.icon).toBeUndefined();
  });
});

describe("prefIconMapFromDirectoryColumnHeaderMeta", () => {
  it("maps headerIcon fields by column key", () => {
    const meta: Record<string, DirectoryColumnHeaderMeta> = {
      name: {
        label: "Name",
        colClass: "x",
        role: "name",
        width: "10%",
        headerIcon: Database,
        headerIconClassName: "text-blue-300",
      },
    };
    const map = prefIconMapFromDirectoryColumnHeaderMeta(meta);
    expect(map.name?.icon).toBe(Database);
    expect(map.name?.iconClassName).toBe("text-blue-300");
  });
});

describe("buildDirectoryColumnItemsFromRoles", () => {
  it("resolves icons from hub table roles", () => {
    const items = buildDirectoryColumnItemsFromRoles([
      { key: "title", label: "Title", role: "name", required: true },
    ]);
    expect(items[0]?.key).toBe("title");
    expect(items[0]?.required).toBe(true);
    expect(items[0]?.icon).toBeDefined();
  });
});

describe("buildDirectoryColumnItemsFromHeaderMeta", () => {
  it("merges base items with header meta icons", () => {
    const meta: Record<string, DirectoryColumnHeaderMeta> = {
      title: {
        label: "Title",
        colClass: "x",
        role: "name",
        width: "10%",
        headerIcon: Play,
        headerIconClassName: "text-emerald-400",
      },
    };
    const items = buildDirectoryColumnItemsFromHeaderMeta([{ key: "title", label: "Title" }], meta);
    expect(items[0]?.icon).toBe(Play);
    expect(items[0]?.iconClassName).toBe("text-emerald-400");
  });
});
