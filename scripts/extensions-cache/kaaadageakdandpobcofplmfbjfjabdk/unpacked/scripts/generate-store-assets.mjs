/**
 * Generate Chrome Web Store screenshot (1280x800) from icon128.png.
 * Usage: node scripts/generate-store-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "store", "assets");

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("sharp not installed — copying icon128 as fallback screenshot");
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "icons", "icon128.png"),
      path.join(OUT_DIR, "screenshot-1.png"),
    );
    fs.copyFileSync(
      path.join(ROOT, "icons", "icon128.png"),
      path.join(OUT_DIR, "promo-small-440.png"),
    );
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const icon = path.join(ROOT, "icons", "icon128.png");

  const screenshotBg = {
    create: {
      width: 1280,
      height: 800,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  };

  const iconBuf = await sharp(icon).resize(220, 220).png().toBuffer();
  await sharp(screenshotBg)
    .composite([{ input: iconBuf, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT_DIR, "screenshot-1.png"));

  await sharp(screenshotBg)
    .resize(440, 280, { fit: "cover" })
    .png()
    .toFile(path.join(OUT_DIR, "promo-small-440.png"));

  console.log("Store assets:", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
