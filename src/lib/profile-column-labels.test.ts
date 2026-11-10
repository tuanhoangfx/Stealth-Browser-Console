import { describe, expect, it } from "vitest";
import { STEALTH_PROFILE_COLUMN_META } from "./directory-column-meta";
import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";
import { PROFILE_FORM_FIELD_STICKER, PROFILE_MODAL_SECTION_STICKER } from "./profile-form-stickers";
import { profileFormFieldHeaderProps } from "./profile-form-field-meta";
import { profileDetailTocNavItems, profileFormTocNavItems } from "../features/profiles/profile-detail-toc-nav";
import { PROFILE_DIRECTORY_COLUMN_ITEMS } from "../features/profiles/profile-directory-prefs";

describe("profile column label SSOT", () => {
  it("directory column uses Profile label with satellite sticker", () => {
    expect(STEALTH_PROFILE_COLUMN_META.profile.label).toBe("Profile");
    expect(STEALTH_PROFILE_COLUMN_STICKER.profile).toBe("📡");
  });

  it("display prefs golden order keeps Profile label", () => {
    const profilePref = PROFILE_DIRECTORY_COLUMN_ITEMS.find((col) => col.key === "profile");
    expect(profilePref?.label).toBe("Profile");
  });

  it("profile modal TOC sections use Profile + Session + Device + Console labels + Lucide nav icons", () => {
    const detailToc = profileDetailTocNavItems();
    const bulkToc = profileDetailTocNavItems({ includeSession: false });
    const formToc = profileFormTocNavItems();
    expect(detailToc.map((i) => i.label)).toEqual(["Profile", "Session", "Device", "Console"]);
    expect(bulkToc.map((i) => i.label)).toEqual(["Profile", "Device", "Console"]);
    expect(detailToc[0].icon).toBeTruthy();
    expect(detailToc[1].icon).toBeTruthy();
    expect(detailToc[0].emoji).toBeUndefined();
    expect(formToc[0]).toMatchObject({ label: "Profile" });
    expect(formToc[0].icon).toBeTruthy();
    expect(PROFILE_MODAL_SECTION_STICKER.profile).toBe("📡");
    expect(PROFILE_MODAL_SECTION_STICKER.session).toBe("🍪");
    expect(PROFILE_MODAL_SECTION_STICKER.note).toBe("✍️");
    expect(PROFILE_MODAL_SECTION_STICKER.history).toBe("🕒");
    expect(PROFILE_MODAL_SECTION_STICKER.console).toBe("📋");
  });

  it("profile modal ADM field headers use emoji stickers and compact labels (P0020 Service Modal parity)", () => {
    expect(profileFormFieldHeaderProps("staticIp")).toEqual({
      label: "Static IP",
      headerEmoji: PROFILE_FORM_FIELD_STICKER.staticIp,
    });
    expect(profileFormFieldHeaderProps("sessionCookies")).toEqual({
      label: "Cookies",
      headerEmoji: "🍪",
    });
    expect(profileFormFieldHeaderProps("sessionBackup")).toEqual({
      label: "Backup",
      headerEmoji: "🛡️",
    });
    expect(profileFormFieldHeaderProps("sessionActions")).toEqual({
      label: "Actions",
      headerEmoji: "⚡",
    });
    expect(profileFormFieldHeaderProps("proxy")).toEqual({
      label: "Proxy",
      headerEmoji: "🛡️",
    });
    expect(profileFormFieldHeaderProps("advancedDevice")).toEqual({
      label: "Advanced",
      headerEmoji: "⚙️",
    });
    expect(profileFormFieldHeaderProps("status")).toEqual({
      label: "Run",
      headerEmoji: "▶️",
    });
    expect(profileFormFieldHeaderProps("e0001").label).toBe("E0001");
    expect(profileFormFieldHeaderProps("e0001").headerImageSrc).toBeTruthy();
    expect(profileFormFieldHeaderProps("e0002").label).toBe("E0002");
    expect(profileFormFieldHeaderProps("e0002").headerImageSrc).toBeTruthy();
    expect(profileFormFieldHeaderProps("surfshark").label).toBe("Surfshark");
    expect(profileFormFieldHeaderProps("surfshark").headerImageSrc).toBeTruthy();
  });
});
