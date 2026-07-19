import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubToolDetailModal } from "./HubToolDetailModal";

describe("HubToolDetailModal busy", () => {
  afterEach(() => cleanup());

  it("marks shell busy without body HubLoaderOrb (Delete parity — footer spinner only)", () => {
    render(
      <HubToolDetailModal open onClose={() => {}} title="ChatGPT" busy busyLabel="Saving…">
        <p>Credentials</p>
      </HubToolDetailModal>,
    );
    expect(document.querySelector(".hub-tool-detail-modal--busy")).toBeTruthy();
    expect(document.querySelector(".hub-loader-orb")).toBeNull();
    expect(document.querySelector(".hub-tab-loader-inline--blocking")).toBeNull();
  });

  it("does not mark shell busy when idle", () => {
    render(
      <HubToolDetailModal open onClose={() => {}} title="ChatGPT">
        <p>Credentials</p>
      </HubToolDetailModal>,
    );
    expect(document.querySelector(".hub-tool-detail-modal--busy")).toBeNull();
  });
});
