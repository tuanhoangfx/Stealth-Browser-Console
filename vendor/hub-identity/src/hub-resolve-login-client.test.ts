import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearHubResolveLoginPrefetch,
  prefetchHubResolveLogin,
  resolveHubLoginEmails,
} from "./hub-resolve-login-client";

describe("resolveHubLoginEmails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubResolveLoginPrefetch();
  });

  it("reuses inflight prefetch for the same User ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await prefetchHubResolveLogin("czpgo");
    const result = await resolveHubLoginEmails("czpgo");
    expect(result).toEqual({ emails: ["czpgo@outlook.com"], lookup: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      loginId: "czpgo",
      identifierKind: "username",
    });
  });

  it("sends identifierKind phone with normalized number", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveHubLoginEmails("0901234567");
    expect(result.lookup).toBe("ok");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      loginId: "84901234567",
      identifierKind: "phone",
    });
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
