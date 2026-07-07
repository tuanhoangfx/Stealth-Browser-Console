"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const script = path.join(__dirname, "kill-port.cjs");
const node = process.execPath;

const blocked = spawnSync(node, [script, "6003"], { encoding: "utf8" });
if (blocked.status === 0) throw new Error("kill-port should refuse :6003");
if (!/refused protected prod port/i.test(blocked.stderr || blocked.stdout)) {
  throw new Error(`unexpected kill-port output: ${blocked.stderr || blocked.stdout}`);
}

const allowed = spawnSync(node, [script, "65535"], { encoding: "utf8" });
if (allowed.status !== 0) throw new Error(`kill-port free port failed: ${allowed.stderr}`);

console.log("kill-port.test: ok");
