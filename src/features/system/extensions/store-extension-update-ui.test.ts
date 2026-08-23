import { describe, expect, it } from "vitest";
import {
  getStoreExtUpdateUi,
  setStoreExtUpdateUi,
  subscribeStoreExtUpdateUi,
} from "./store-extension-update-ui";

describe("store-extension-update-ui", () => {
  it("notifies subscribers when updating", () => {
    let seen = "";
    const off = subscribeStoreExtUpdateUi(() => {
      seen = getStoreExtUpdateUi().label;
    });
    setStoreExtUpdateUi({ phase: "updating", label: "Updating extensions…", detail: "FB001" });
    expect(seen).toBe("Updating extensions…");
    expect(getStoreExtUpdateUi().phase).toBe("updating");
    setStoreExtUpdateUi({ phase: "idle", label: "", detail: "" });
    off();
  });
});
