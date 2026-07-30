import { describe, expect, it } from "vitest";
import { readDevAutoLoginCreds, isDevAutoLoginEnabled } from "./dev-auto-login";

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
