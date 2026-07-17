import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HUB_LAYOUT3_DETAIL_TOKENS } from "./hubAccountDetailModal";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "../styles/hub-account-detail-modal.css");

describe("HUB_LAYOUT3_DETAIL_TOKENS", () => {
  it("matches Layout 3 CSS custom properties", () => {
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain(`--hub-adm-toc-w: ${HUB_LAYOUT3_DETAIL_TOKENS.tocW}`);
    expect(css).toContain(`--hub-tool-detail-rail-w: ${HUB_LAYOUT3_DETAIL_TOKENS.railW}`);
    expect(css).toContain(`--hub-tool-detail-split-min-h: ${HUB_LAYOUT3_DETAIL_TOKENS.splitMinH}`);
    expect(css).toContain(`--hub-account-detail-columns-gap: ${HUB_LAYOUT3_DETAIL_TOKENS.columnsGap}`);
    expect(css).toContain(`--hub-modal-max-h: ${HUB_LAYOUT3_DETAIL_TOKENS.modalMaxH}`);
    expect(css).toContain(`--hub-modal-max-vh: ${HUB_LAYOUT3_DETAIL_TOKENS.modalMaxVh}`);
    expect(css).toMatch(
      /\.hub-tool-detail-rail\.hub-adm-rail--note\s*\{[^}]*flex:\s*2\s+1\s+0/s,
    );
    expect(css).toMatch(
      /\.hub-tool-detail-rail\.hub-adm-rail--log\s*\{[^}]*flex:\s*3\s+1\s+0/s,
    );
  });
});
