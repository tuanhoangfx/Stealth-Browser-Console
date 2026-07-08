import { describe, expect, it, beforeEach } from "vitest";
import { LayoutDashboard, Brain, Radio } from "lucide-react";
import { applyFirstVisitNavGroupDefaults } from "./applyFirstVisitNavGroupDefaults";
import type { NavStructureEntry } from "./nav-sidebar-structure";

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
];

describe("applyFirstVisitNavGroupDefaults", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("collapses inactive groups on first visit only", () => {
    const opened: Record<string, boolean> = {};
    applyFirstVisitNavGroupDefaults({
      prefix: "test",
      structure: FIXTURE,
      activeScreen: "dashboard",
      setGroupSubnavOpen: (id, open) => {
        opened[id] = open;
      },
    });

    expect(opened.chatbot).toBe(false);
    expect(sessionStorage.getItem("test:nav-density-v1")).toBe("1");

    opened.chatbot = true;
    applyFirstVisitNavGroupDefaults({
      prefix: "test",
      structure: FIXTURE,
      activeScreen: "dashboard",
      setGroupSubnavOpen: (id, open) => {
        opened[id] = open;
      },
    });
    expect(opened.chatbot).toBe(true);
  });

  it("opens group containing active screen", () => {
    const opened: Record<string, boolean> = {};
    applyFirstVisitNavGroupDefaults({
      prefix: "test",
      structure: FIXTURE,
      activeScreen: "personalities",
      setGroupSubnavOpen: (id, open) => {
        opened[id] = open;
      },
    });
    expect(opened.chatbot).toBe(true);
  });
});
