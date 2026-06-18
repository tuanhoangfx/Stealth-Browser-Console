const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "build", "icons");
const committedIco = path.join(outDir, "app.ico");
const committedPng = path.join(outDir, "app.png");

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(committedIco) && fs.existsSync(committedPng)) {
    console.log(`[sync-app-icon] ok — using committed ${path.relative(rootDir, committedIco)}`);
    return;
  }
  throw new Error(
    `Missing build/icons/app.ico or app.png — add icons under ${path.relative(rootDir, outDir)} before packaging.`
  );
}

main();
