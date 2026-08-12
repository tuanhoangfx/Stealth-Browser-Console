import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHubLoginEmails } from "./hub-resolve-login-client";

describe("resolveHubLoginEmails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok with emails on HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
      }),
    );

    const result = await resolveHubLoginEmails("czpgo");
    expect(result).toEqual({ emails: ["czpgo@outlook.com"], lookup: "ok" });
  });

  it("returns not_found when profile missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: [] }),
      }),
    );

    const result = await resolveHubLoginEmails("notauser");
    expect(result).toEqual({ emails: [], lookup: "not_found" });
  });

  it("returns unavailable on non-OK HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 405,
        json: async () => ({}),
      }),
    );

    const result = await resolveHubLoginEmails("czpgo");
    expect(result).toEqual({ emails: [], lookup: "unavailable", httpStatus: 405 });
  });
});
