import { describe, expect, it } from "vitest";
import { assertHubAvatarFile, hubAvatarExt, hubAvatarPublicUrl } from "./hub-avatar-upload";

describe("hubAvatarUpload", () => {
  it("maps mime to extension and builds public URL", () => {
    const file = new File([new Uint8Array(8)], "photo.PNG", { type: "image/png" });
    expect(hubAvatarExt(file)).toBe("png");
    expect(hubAvatarPublicUrl("https://hub-api.infi.io.vn/", "u1/a.png")).toBe(
      "https://hub-api.infi.io.vn/storage/v1/object/public/avatars/u1/a.png",
    );
  });

  it("rejects oversized files", () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    expect(() => assertHubAvatarFile(file)).toThrow(/2 MB/);
  });
});
