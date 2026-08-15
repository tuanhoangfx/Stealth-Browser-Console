import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEV_AUTO_LOGIN_SESSION_KEY,
  isDevAutoLoginEnabled,
  isDevAutoLoginOptedOut,
  readDevAutoLoginCreds,
} from "./dev-auto-login";

describe("dev-auto-login browser safety", () => {
  it("readDevAutoLoginCreds does not throw when process is undefined (Vite browser)", () => {
    const had = globalThis.process;
    // @ts-expect-error intentional
    delete globalThis.process;
    expect(() => readDevAutoLoginCreds()).not.toThrow();
    globalThis.process = had;
  });

  it("isDevAutoLoginEnabled does not throw when process is missing", () => {
    const had = globalThis.process;
    // @ts-expect-error intentional
    delete globalThis.process;
    expect(() => isDevAutoLoginEnabled("127.0.0.1")).not.toThrow();
    globalThis.process = had;
  });
});

describe("dev-auto-login opt-out", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWindow(search: string) {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { search, hostname: "127.0.0.1" },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    return store;
  }

  it("`?devAutoLogin=off` opts out and sticks for the tab", () => {
    const store = stubWindow("?devAutoLogin=off");
    expect(isDevAutoLoginOptedOut()).toBe(true);
    expect(store.get(DEV_AUTO_LOGIN_SESSION_KEY)).toBe("off");
    expect(isDevAutoLoginEnabled("127.0.0.1")).toBe(false);

    // Same tab, param dropped after an SPA navigation — still opted out.
    vi.stubGlobal("window", {
      location: { search: "", hostname: "127.0.0.1" },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined },
    });
    expect(isDevAutoLoginOptedOut()).toBe(true);
  });

  it("`?devAutoLogin=on` clears the opt-out", () => {
    const store = stubWindow("?devAutoLogin=on");
    expect(isDevAutoLoginOptedOut()).toBe(false);
    expect(store.get(DEV_AUTO_LOGIN_SESSION_KEY)).toBe("on");
  });

  it("stays enabled without the param", () => {
    stubWindow("");
    expect(isDevAutoLoginOptedOut()).toBe(false);
  });
});
