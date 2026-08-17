import { describe, expect, it } from "vitest";
import { hubSessionLabels } from "@tool-workspace/hub-identity";
import { workspaceUserFooterLabel } from "./workspace-user-session";

describe("workspaceUserFooterLabel", () => {
  it("prefers display name over username and never shows email", () => {
    const session = {
      user: {
        id: "u1",
        email: "duyceo01@ntx1.id.vn",
        user_metadata: { login_id: "duyceo01", full_name: "Duy CEO" },
      },
    } as never;
    expect(
      workspaceUserFooterLabel({
        session,
        labels: hubSessionLabels(session),
      }),
    ).toBe("Duy CEO");
  });

  it("falls back to username when display name is missing", () => {
    expect(
      workspaceUserFooterLabel({
        labels: {
          authEmail: "duyceo01@ntx1.id.vn",
          loginId: "duyceo01",
          email: "kinhdoanh@enzyvina.com",
          displayName: "",
          hasSyntheticAuth: false,
        },
      }),
    ).toBe("duyceo01");
  });

  it("uses live profile overrides when provided", () => {
    expect(
      workspaceUserFooterLabel({
        labels: {
          authEmail: "duyceo01@ntx1.id.vn",
          loginId: "duyceo01",
          email: "kinhdoanh@enzyvina.com",
          displayName: "",
          hasSyntheticAuth: false,
        },
        displayName: "Duy CEO",
        username: "duyceo01",
      }),
    ).toBe("Duy CEO");
  });

  it("never returns an email address", () => {
    const label = workspaceUserFooterLabel({
      session: {
        user: { id: "u1", email: "only@example.com", user_metadata: {} },
      } as never,
    });
    expect(label.includes("@")).toBe(false);
    expect(label).toBe("only");
  });

  it("returns anonymous label when requested", () => {
    expect(workspaceUserFooterLabel({ anonymous: true })).toBe("Anonymous");
  });
});
