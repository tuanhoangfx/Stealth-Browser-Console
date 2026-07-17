#!/usr/bin/env node
"use strict";
const http = require("node:http");

const BASES = ["http://127.0.0.1:6003", "http://127.0.0.1:6004"];

function post(base) {
  return new Promise((resolve) => {
    const url = new URL("/api/catalog/checkpoint", base);
    const req = http.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: "POST", timeout: 4000 },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

(async () => {
  for (const base of BASES) {
    if (await post(base)) process.exit(0);
  }
  process.exit(1);
})();
