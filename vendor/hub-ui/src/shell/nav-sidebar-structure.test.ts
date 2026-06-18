import { describe, expect, it } from "vitest";
import { LayoutDashboard, Radio, Brain } from "lucide-react";
import {
  flatMapNavScreenItems,
  isNavGroupActive,
  isNavScreenGroup,
  isNavViewGroup,
  navGroupSubnavOpenKey,
  navScreenGroupSubNavItems,
  navViewGroupSubNavItems,
  type NavStructureEntry,
} from "./nav-sidebar-structure";

const FIXTURE: NavStructureEntry<string, string, string>[] = [
  { kind: "screen", screen: "dashboard", label: "Dashboard", icon: LayoutDashboard, iconTone: "sky" },
  {
    kind: "group",
    navMode: "screen",
    id: "chatbot",
    label: "Chatbot",
    icon: Brain,
    iconTone: "violet",
    defaultScreen: "personalities",
    children: [
      { screen: "personalities", label: "Personalities", icon: Brain, iconTone: "violet" },
      { screen: "channels", label: "Channels", icon: Radio, iconTone: "fuchsia" },
    ],
  },
  {
    kind: "group",
    navMode: "view",
    id: "facebook",
    label: "Facebook",
    icon: LayoutDashboard,
    iconTone: "blue",
    screen: "fanpages",
    defaultView: "pages",
    children: [
      { view: "pages", label: "Pages", icon: LayoutDashboard, iconTone: "blue" },
      { view: "uploader", label: "Uploader", icon: Radio, iconTone: "sky" },
    ],
  },
];

describe("nav-sidebar-structure", () => {
  it("navGroupSubnavOpenKey builds session keys", () => {
    expect(navGroupSubnavOpenKey("chat-center", "zalo")).toBe("chat-center:zalo-subnav-open");
  });

  it("isNavGroupActive for screen and view groups", () => {
    const chatbot = FIXTURE[1];
    const facebook = FIXTURE[2];
    expect(isNavGroupActive(chatbot, "personalities")).toBe(true);
    expect(isNavGroupActive(chatbot, "dashboard")).toBe(false);
    expect(isNavGroupActive(facebook, "fanpages")).toBe(true);
    expect(isNavGroupActive(facebook, "personalities")).toBe(false);
  });

  it("flatMapNavScreenItems includes view parent once", () => {
    const flat = flatMapNavScreenItems(FIXTURE);
    expect(flat.map((i) => i.screen)).toEqual(["dashboard", "personalities", "channels", "fanpages"]);
  });

  it("navScreenGroupSubNavItems maps screen ids", () => {
    const chatbot = FIXTURE[1];
    if (!isNavScreenGroup(chatbot)) throw new Error("expected screen group");
    expect(navScreenGroupSubNavItems(chatbot.children).map((i) => i.id)).toEqual(["personalities", "channels"]);
  });

  it("navViewGroupSubNavItems maps view ids", () => {
    const facebook = FIXTURE[2];
    if (!isNavViewGroup(facebook)) throw new Error("expected view group");
    expect(navViewGroupSubNavItems(facebook.children).map((i) => i.id)).toEqual(["pages", "uploader"]);
  });
});
