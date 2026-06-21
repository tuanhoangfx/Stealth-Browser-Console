import { describe, expect, it } from "vitest";
import { Database, Play } from "lucide-react";
import { withDirectoryColumnIcons, withPrefItemIcons } from "./pref-item-icons";

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
});
