import { describe, expect, it } from "vitest";
import {
  STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS,
  STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS,
} from "./stealth-adm-detail-modal";

describe("stealth ADM detail modal shell", () => {
  it("Create uses Layout 3 size, not compact --fit (28rem)", () => {
    expect(STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS).not.toContain("hub-tool-detail-modal--fit");
    expect(STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS).toContain("hub-tool-detail-modal--split");
    expect(STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS).toContain("hub-account-detail-modal");
    expect(STEALTH_ADM_DETAIL_CREATE_MODAL_SHELL_CLASS).toContain("stealth-profile-create-modal");
  });

  it("Edit uses Layout 3 size, not compact --fit", () => {
    expect(STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS).not.toContain("hub-tool-detail-modal--fit");
    expect(STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS).toContain("hub-tool-detail-modal--split");
  });
});
