import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HubDirectoryColumnDef } from "@tool-workspace/hub-ui";
import type { ProfileRow } from "../../types";
import { renderStealthProfileDirectoryBodyCell } from "./stealth-profile-directory-cells";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

const noteCol = {
  key: "note",
  label: "Note",
  role: "notes",
  colClass: "hub-users-col--id",
  width: "12rem",
} as HubDirectoryColumnDef<StealthProfileSortKey>;

const profile = {
  id: "9990",
  name: "9990",
  note: "Agent pool —\nparallel headless\nsmoke (9990-9999)",
} as ProfileRow;

describe("renderStealthProfileDirectoryBodyCell note", () => {
  it("paints one flattened line and does not keep newlines", () => {
    const html = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(noteCol, profile)!);
    expect(html).toContain("Agent pool — parallel headless smoke (9990-9999)");
    expect(html.includes("\n")).toBe(false);
    expect(html).toContain("truncate");
  });
});
