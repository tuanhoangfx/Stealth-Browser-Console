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

  it("forceRefresh skips a cached ok lookup so Sign In hits the API again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authEmails: ["cs00616@outlook.com"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await prefetchHubResolveLogin("cs00616");
    const again = await resolveHubLoginEmails("cs00616", { forceRefresh: true });
    expect(again.lookup).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns unavailable when resolve-login fetch times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })),
    );

    const result = await resolveHubLoginEmails("cs00004");
    expect(result).toEqual({ emails: [], lookup: "unavailable" });
  });

  it("does not stick a settled unavailable lookup — retry Sign In hits the API again", async () => {
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    const fetchMock = vi
      .fn()
      // fetchHubAuth retries once — both attempts must fail to settle unavailable.
      .mockRejectedValueOnce(abort)
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, authEmails: ["cs00616@outlook.com"] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveHubLoginEmails("cs00616");
    expect(first.lookup).toBe("unavailable");
    const second = await resolveHubLoginEmails("cs00616");
    expect(second).toEqual({ emails: ["cs00616@outlook.com"], lookup: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
