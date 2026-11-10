import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HUB_DIRECTORY_NOTE_COL_WIDTH, type HubDirectoryColumnDef } from "@tool-workspace/hub-ui";
import type { ProfileRow } from "../../types";
import { renderStealthProfileDirectoryBodyCell } from "./stealth-profile-directory-cells";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

const noteCol = {
  key: "note",
  label: "Note",
  role: "notes",
  colClass: "hub-users-col--id",
  width: HUB_DIRECTORY_NOTE_COL_WIDTH,
} as HubDirectoryColumnDef<StealthProfileSortKey>;

const profile = {
  id: "9990",
  name: "9990",
  createdAt: "2026-10-23T08:30:00.000Z",
  note: "Agent pool —\nparallel headless\nsmoke (9990-9999)",
} as ProfileRow;

const profileCol = {
  key: "profile",
  label: "Profile",
  role: "id",
  colClass: "hub-users-col--id",
  width: "6rem",
} as HubDirectoryColumnDef<StealthProfileSortKey>;

const statusCol = {
  key: "status",
  label: "Run",
  role: "tools",
  colClass: "hub-users-col--tools",
  width: "4.5rem",
} as HubDirectoryColumnDef<StealthProfileSortKey>;

describe("renderStealthProfileDirectoryBodyCell run", () => {
  it("keeps the headless 👻 emoji beside Stop on one line and wraps in Active AI Agent Headless popover", () => {
    const running = { id: "0011", name: "0011", status: "running", headless: true } as ProfileRow;
    const html = renderToStaticMarkup(
      renderStealthProfileDirectoryBodyCell(statusCol, running, "", {
        runningHeadlessIds: new Set(["0011"]),
        headlessReasons: { "0011": "Gmail Permanent Forward Worker (PID 27996) · Elapsed: 42s" },
      })!,
    );
    const label = html.match(/hub-directory-icon-cell__label[^>]*>(.*?)<\/span>/)?.[1] ?? "";
    expect(label).toContain("Stop");
    expect(label).not.toContain("<svg");
    expect(html).toContain("👻");
    expect(html).toContain("hub-directory-popover-anchor");
    expect(html).toContain("hub-directory-icon-cell__trailing");
    expect(html.indexOf("hub-directory-icon-cell__label")).toBeLessThan(
      html.indexOf("hub-directory-icon-cell__trailing"),
    );
  });

  it("renders Run with 👻 emoji when only Agent Headless Shadow lane is active on a normal user profile", () => {
    const shadowOnly = { id: "0055", name: "0055", status: "running", headless: false } as ProfileRow;
    const html = renderToStaticMarkup(
      renderStealthProfileDirectoryBodyCell(statusCol, shadowOnly, "", {
        runningHeadlessIds: new Set(["0055"]),
      })!,
    );
    const label = html.match(/hub-directory-icon-cell__label[^>]*>(.*?)<\/span>/)?.[1] ?? "";
    expect(label).toContain("Run");
    expect(html).toContain("👻");
    expect(html).toContain("hub-directory-icon-cell__trailing");
    expect(html).toContain("agent headless active");
  });

  it("renders Run with ⏳ emoji and Waiting popover when profile is in waitingReasons", () => {
    const waitingProf = { id: "0457", name: "0457", status: "closed", headless: false } as ProfileRow;
    const html = renderToStaticMarkup(
      renderStealthProfileDirectoryBodyCell(statusCol, waitingProf, "", {
        waitingReasons: { "0457": "Gmail Auto-Login Lane" },
      })!,
    );
    expect(html).toContain("⏳");
    expect(html).toContain("hub-directory-popover-anchor");
  });

  it("renders Stop with Lock indicator when profile is open in Protected User Headed mode", () => {
    const userHeaded = { id: "0009", name: "0009", status: "running", headless: false } as ProfileRow;
    const html = renderToStaticMarkup(
      renderStealthProfileDirectoryBodyCell(statusCol, userHeaded, "", {
        runningHeadlessIds: new Set(),
      })!,
    );
    const label = html.match(/hub-directory-icon-cell__label[^>]*>(.*?)<\/span>/)?.[1] ?? "";
    expect(label).toContain("Stop");
    expect(html).toContain("hub-directory-icon-cell__trailing");
    expect(html).toContain("protected user active");
  });
});

describe("renderStealthProfileDirectoryBodyCell note", () => {
  it("paints one flattened line and does not keep newlines", () => {
    const html = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(noteCol, profile)!);
    expect(html).toContain("Agent pool — parallel headless smoke (9990-9999)");
    expect(html.includes("\n")).toBe(false);
    expect(html).toContain("truncate");
  });

  it("wraps Profile ID in HubDirectoryValuePopover with Created timestamp", () => {
    const html = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(profileCol, profile)!);
    expect(html).toContain("9990");
    expect(html).toContain("hub-directory-popover-anchor");
  });

  it("renders Country VPN flag badge and popover for vpn://US proxy spec", () => {
    const proxyCol = {
      key: "proxy",
      label: "Proxy",
      role: "meta",
      colClass: "hub-users-col--meta",
      width: "8rem",
    } as HubDirectoryColumnDef<StealthProfileSortKey>;
    const vpnProfile = {
      id: "8001",
      name: "8001",
      proxy: "vpn://US",
      note: "Claude profile",
    } as ProfileRow;
    const html = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(proxyCol, vpnProfile)!);
    expect(html).toContain("VPN US");
    expect(html).toContain("flagsapi.com/US/");
    expect(html).toContain("hub-directory-popover-anchor");
  });

  it("renders compact Pin icon-only indicator beside proxy when staticIp is true", () => {
    const proxyCol = {
      key: "proxy",
      label: "Proxy",
      role: "meta",
      colClass: "hub-users-col--meta",
      width: "8rem",
    } as HubDirectoryColumnDef<StealthProfileSortKey>;
    const staticProfile = {
      id: "8002",
      name: "8002",
      proxy: "http://10.0.0.1:8080",
      staticIp: true,
    } as ProfileRow;
    const html = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(proxyCol, staticProfile)!);
    expect(html).toContain("http://10.0.0.1:8080");
    expect(html).toContain('aria-label="Static IP"');
    expect(html).toContain("<svg");
    expect(html).not.toContain(">Static<");
  });

  it("renders Proxy VN and Proxy US with country flag instead of raw IP:port", () => {
    const proxyCol = {
      key: "proxy",
      label: "Proxy",
      role: "meta",
      colClass: "hub-users-col--meta",
      width: "8rem",
    } as HubDirectoryColumnDef<StealthProfileSortKey>;
    const vnProfile = {
      id: "8003",
      name: "8003",
      proxy: "14.190.107.137:48324:infi:openQQ",
      staticIp: true,
    } as ProfileRow;
    const usProfile = {
      id: "8004",
      name: "8004",
      proxy: "180.149.35.86:17437:infi:openQQ",
      staticIp: true,
    } as ProfileRow;
    const vnHtml = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(proxyCol, vnProfile)!);
    const usHtml = renderToStaticMarkup(renderStealthProfileDirectoryBodyCell(proxyCol, usProfile)!);
    expect(vnHtml).toContain("Proxy VN");
    expect(vnHtml).toContain('alt="VN"');
    expect(usHtml).toContain("Proxy US");
    expect(usHtml).toContain('alt="US"');
  });
});
