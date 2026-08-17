import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HubFullUserAccountModal } from "./HubFullUserAccountModal";
import { HubWorkspaceUserShell } from "./HubWorkspaceUserShell";

vi.mock("@tool-workspace/hub-identity", async () => {
  const actual = await vi.importActual<typeof import("@tool-workspace/hub-identity")>(
    "@tool-workspace/hub-identity",
  );
  return {
    ...actual,
    createHubFullAccountAuthHandlers: () => ({
      onResolveRole: async () => "admin",
      onUpdateUsername: async () => ({ ok: true, message: "ok" }),
      onLinkEmail: async () => ({ ok: true, message: "ok" }),
      onUpdatePassword: async () => ({ ok: true, message: "ok" }),
      fetchOwnProfileFields: async () => null,
      onUpdateOwnProfile: async () => ({ ok: true, message: "ok" }),
    }),
  };
});

describe("HubWorkspaceUserShell", () => {
  it("defaults to Full User Account Modal with Crown role + Credentials", async () => {
    const session = {
      access_token: "t",
      user: {
        id: "u1",
        email: "admin@example.com",
        app_metadata: { role: "admin" },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      },
    } as never;

    render(
      <HubWorkspaceUserShell
        session={session}
        forceModalOpen
        onSignOut={async () => true}
        getHubClient={() => null}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("hub-account-detail-modal");
    expect(within(dialog).getAllByText("Credentials").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Vault ID")).toBeTruthy();
    expect(dialog.querySelector(".lucide-crown")).toBeTruthy();
    expect(document.querySelector("[data-hub-sidebar-user]")).toBeTruthy();
  });

  it("saves edited email and password through injected mock handlers only", async () => {
    const onLinkEmail = vi.fn().mockResolvedValue({ ok: true, message: "linked" });
    const onUpdatePassword = vi.fn().mockResolvedValue({ ok: true, message: "updated" });
    const session = {
      access_token: "test-token",
      user: {
        id: "p0020-smoke-user",
        email: "before@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      },
    } as never;

    render(
      <HubFullUserAccountModal
        open
        onClose={vi.fn()}
        session={session}
        initials="PS"
        roleLabel="User"
        onLinkEmail={onLinkEmail}
        onUpdatePassword={onUpdatePassword}
        onSignOut={async () => ({ ok: true, message: "" })}
      />,
    );

    const dialog = screen.getAllByRole("dialog").at(-1)!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Email" }));
    fireEvent.change(dialog.querySelector('[name="hub-adm-edit-email"]')!, {
      target: { value: "after@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Password" }));
    fireEvent.change(dialog.querySelector('input[type="password"]')!, {
      target: { value: "safe-mock-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(onLinkEmail).toHaveBeenCalledWith("after@example.com");
      expect(onUpdatePassword).toHaveBeenCalledWith("safe-mock-password");
    });
  });

  it("does not append an account log entry when a mock email save fails", async () => {
    sessionStorage.clear();
    const onLinkEmail = vi.fn().mockResolvedValue({ ok: false, message: "mock rejection" });
    const session = {
      access_token: "test-token",
      user: {
        id: "p0020-failed-save",
        email: "before@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      },
    } as never;

    render(
      <HubFullUserAccountModal
        open
        onClose={vi.fn()}
        session={session}
        initials="PS"
        roleLabel="User"
        onLinkEmail={onLinkEmail}
        onUpdatePassword={async () => ({ ok: true, message: "" })}
        onSignOut={async () => ({ ok: true, message: "" })}
      />,
    );

    const dialog = screen.getAllByRole("dialog").at(-1)!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Email" }));
    fireEvent.change(dialog.querySelector('[name="hub-adm-edit-email"]')!, {
      target: { value: "rejected@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onLinkEmail).toHaveBeenCalledWith("rejected@example.com"));
    expect(sessionStorage.getItem("hub-user-account-log:p0020-failed-save")).toBeNull();
  });

  it("does not append an account log entry when a mock mirror password save fails", async () => {
    sessionStorage.clear();
    const onUpdatePassword = vi.fn().mockResolvedValue({ ok: false, message: "mirror sync rejected" });
    const session = {
      access_token: "test-token",
      user: {
        id: "p0020-failed-password",
        email: "before@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      },
    } as never;

    render(
      <HubFullUserAccountModal
        open
        onClose={vi.fn()}
        session={session}
        initials="PS"
        roleLabel="User"
        onLinkEmail={async () => ({ ok: true, message: "" })}
        onUpdatePassword={onUpdatePassword}
        onSignOut={async () => ({ ok: true, message: "" })}
      />,
    );

    const dialog = screen.getAllByRole("dialog").at(-1)!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Password" }));
    fireEvent.change(dialog.querySelector('input[type="password"]')!, {
      target: { value: "mirror-rejected-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onUpdatePassword).toHaveBeenCalledWith("mirror-rejected-password"));
    expect(sessionStorage.getItem("hub-user-account-log:p0020-failed-password")).toBeNull();
  });
});
