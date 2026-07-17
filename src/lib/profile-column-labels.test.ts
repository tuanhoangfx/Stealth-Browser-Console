import { describe, expect, it } from "vitest";
import { STEALTH_PROFILE_COLUMN_META } from "./directory-column-meta";
import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";
import { PROFILE_MODAL_SECTION_STICKER } from "./profile-form-stickers";
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

  it("profile modal TOC sections use Profile label + Lucide nav icons", () => {
    const detailToc = profileDetailTocNavItems();
    const formToc = profileFormTocNavItems();
    expect(detailToc[0]).toMatchObject({ label: "Profile" });
    expect(detailToc[0].icon).toBeTruthy();
    expect(detailToc[0].emoji).toBeUndefined();
    expect(formToc[0]).toMatchObject({ label: "Profile" });
    expect(formToc[0].icon).toBeTruthy();
    expect(PROFILE_MODAL_SECTION_STICKER.profile).toBe("📡");
    expect(PROFILE_MODAL_SECTION_STICKER.note).toBe("📜");
    expect(PROFILE_MODAL_SECTION_STICKER.history).toBe("🕒");
    expect(PROFILE_MODAL_SECTION_STICKER.console).toBe("📋");
  });
});
