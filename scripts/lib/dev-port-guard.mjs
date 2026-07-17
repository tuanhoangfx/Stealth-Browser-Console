/** Probe whether P0003 Vite dev server is listening — avoid disruptive predev while dev is active. */
import net from "node:net";

export const STEALTH_DEV_PORT = 5175;

export function isDevPortListening(port = STEALTH_DEV_PORT, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

export function waitForDevPort(port = STEALTH_DEV_PORT, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      void isDevPortListening(port, 500).then((up) => {
        if (up) resolve();
        else if (Date.now() > deadline) reject(new Error(`vite did not open :${port} in time`));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}
