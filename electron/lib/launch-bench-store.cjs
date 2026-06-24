const fs = require("node:fs");
const path = require("node:path");

const BENCH_FILENAME = "launch-bench.json";

function benchFilePath(projectRoot) {
  const root = projectRoot || path.resolve(__dirname, "..", "..");
  return path.join(root, ".dev", BENCH_FILENAME);
}

function readLaunchBench(projectRoot) {
  const file = benchFilePath(projectRoot);
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function writeLaunchBench(projectRoot, payload) {
  const file = benchFilePath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record = {
    ...payload,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
  return record;
}

module.exports = { benchFilePath, readLaunchBench, writeLaunchBench };
