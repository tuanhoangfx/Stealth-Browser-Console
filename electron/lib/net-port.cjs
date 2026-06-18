"use strict";
/**
 * Network helpers cho CDP passthrough.
 * - getFreePort: cấp một cổng TCP ephemeral trống trên 127.0.0.1.
 * - fetchCdpVersion: đọc /json/version từ remote-debugging-port để lấy webSocketDebuggerUrl.
 */
const net = require("node:net");
const http = require("node:http");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      srv.close(() => {
        if (port) resolve(port);
        else reject(new Error("Không cấp được cổng trống"));
      });
    });
  });
}

/** Đọc http://127.0.0.1:<port>/json/version — Chrome DevTools metadata. */
function fetchCdpVersion(port, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/json/version", timeout: timeoutMs },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("CDP version timeout")));
    req.on("error", reject);
  });
}

/** Poll cho tới khi remote-debugging-port trả về webSocketDebuggerUrl (Chrome cần vài trăm ms). */
async function waitForCdp(port, { attempts = 20, intervalMs = 150 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const info = await fetchCdpVersion(port);
      if (info && info.webSocketDebuggerUrl) return info;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastErr || new Error("CDP endpoint không sẵn sàng");
}

module.exports = { getFreePort, fetchCdpVersion, waitForCdp };
