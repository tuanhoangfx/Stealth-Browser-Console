import { describe, expect, it } from "vitest";
import { buildHubBrandFilterOption, hubBrandFilterIcon } from "./build-hub-brand-filter-option";

describe("hubBrandFilterIcon", () => {
  it("returns src/shell without label", () => {
    expect(hubBrandFilterIcon({ src: "/assets/brand-icons/chatgpt.png", shell: "bare" })).toEqual({
      src: "/assets/brand-icons/chatgpt.png",
      shell: "bare",
    });
  });

  it("returns null when src missing", () => {
    expect(hubBrandFilterIcon(null)).toBeNull();
    expect(hubBrandFilterIcon({ src: "" })).toBeNull();
  });
});

describe("buildHubBrandFilterOption + hubBrandFilterIcon", () => {
  it("uses value as label when company brand.label is omitted", () => {
    const opt = buildHubBrandFilterOption(
      "ChatGPT",
      10,
      hubBrandFilterIcon({ src: "/assets/brand-icons/chatgpt.png", shell: "bare", label: "OpenAI" as never }),
    );
    // hubBrandFilterIcon strips label even if caller passes a wider object
    expect(opt.label).toBe("ChatGPT");
    expect(opt.value).toBe("ChatGPT");
    expect(opt.iconSrc).toBe("/assets/brand-icons/chatgpt.png");
  });
});
