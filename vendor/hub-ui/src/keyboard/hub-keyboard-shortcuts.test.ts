import { afterEach, describe, expect, it, vi } from "vitest";
import { HUB_MODAL_SEARCH_ATTR } from "./hub-modal-search";
import {
  registerHubSearchFocus,
  registerHubSearchClear,
  setHubActiveScreen,
} from "./hub-keyboard-shortcuts";

describe("hub keyboard shortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    setHubActiveScreen("default");
  });

  it("focuses the active screen search when no modal is open", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, "focus");
    const selectSpy = vi.spyOn(input, "select");
    setHubActiveScreen("services");
    const unregisterFocus = registerHubSearchFocus("services", () => {
      input.focus();
      input.select();
    });
    const unregisterClear = registerHubSearchClear("services", () => {}, () => input);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);

    unregisterFocus();
    unregisterClear();
  });

  it("focuses visible modal search before page search", () => {
    const pageInput = document.createElement("input");
    pageInput.setAttribute("role", "searchbox");
    document.body.appendChild(pageInput);
    const pageFocusSpy = vi.spyOn(pageInput, "focus");

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const modalInput = document.createElement("input");
    modalInput.setAttribute("role", "searchbox");
    Object.defineProperty(modalInput, "getClientRects", {
      value: () => [{ width: 100, height: 24 }],
    });
    const modalFocusSpy = vi.spyOn(modalInput, "focus");
    const modalSelectSpy = vi.spyOn(modalInput, "select");
    dialog.appendChild(modalInput);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(modalFocusSpy).toHaveBeenCalledTimes(1);
    expect(modalSelectSpy).toHaveBeenCalledTimes(1);
    expect(pageFocusSpy).not.toHaveBeenCalled();
  });

  it("prefers data-hub-modal-search over generic searchbox", () => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const genericInput = document.createElement("input");
    genericInput.setAttribute("role", "searchbox");
    Object.defineProperty(genericInput, "getClientRects", {
      value: () => [{ width: 100, height: 24 }],
    });
    const markedInput = document.createElement("input");
    markedInput.setAttribute(HUB_MODAL_SEARCH_ATTR, "");
    Object.defineProperty(markedInput, "getClientRects", {
      value: () => [{ width: 100, height: 24 }],
    });

    const genericFocusSpy = vi.spyOn(genericInput, "focus");
    const markedFocusSpy = vi.spyOn(markedInput, "focus");

    dialog.appendChild(genericInput);
    dialog.appendChild(markedInput);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));

    expect(markedFocusSpy).toHaveBeenCalledTimes(1);
    expect(genericFocusSpy).not.toHaveBeenCalled();
  });
});
