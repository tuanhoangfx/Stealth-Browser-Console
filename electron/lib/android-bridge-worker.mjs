import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";

const bridgeFile = process.env.P0003_ANDROID_BRIDGE_FILE || "";
if (!bridgeFile) {
  process.stderr.write("[android-bridge-worker] missing P0003_ANDROID_BRIDGE_FILE\n");
  process.exit(2);
}

const bridge = await import(`${pathToFileURL(bridgeFile).href}?workerBoot=${Date.now()}`);
const sseSubs = new Map();

const sendMsg = (payload) => {
  if (typeof process.send === "function") {
    try {
      process.send(payload);
    } catch {
      /* ignore closed parent channel */
    }
  }
};

process.on("message", async (msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "sse-close") {
    const entry = sseSubs.get(msg.sseId);
    if (entry) {
      sseSubs.delete(msg.sseId);
      entry.req.emit("close");
    }
    return;
  }

  if (msg.type === "sse-sub") {
    const { sseId, method, args = [] } = msg;
    const fn = bridge?.[method];
    if (typeof fn !== "function") {
      sendMsg({ type: "sse-error", sseId, error: `Unknown bridge stream method: ${method}` });
      return;
    }
    const mockReq = new EventEmitter();
    mockReq.headers = msg.headers || {};
    mockReq.method = "GET";
    mockReq.url = msg.url || "/";
    const mockRes = {
      headersSent: false,
      writableEnded: false,
      writeHead(status, headers) {
        this.headersSent = true;
        sendMsg({ type: "sse-head", sseId, status: Number(status) || 200, headers: headers || {} });
      },
      write(chunk) {
        if (this.writableEnded) return false;
        const isBuf = Buffer.isBuffer(chunk);
        sendMsg({
          type: "sse-write",
          sseId,
          isB64: isBuf,
          chunk: isBuf ? chunk.toString("base64") : String(chunk ?? ""),
        });
        return true;
      },
      end(chunk) {
        if (chunk !== undefined) this.write(chunk);
        if (!this.writableEnded) {
          this.writableEnded = true;
          sseSubs.delete(sseId);
          sendMsg({ type: "sse-end", sseId });
        }
      },
    };
    sseSubs.set(sseId, { req: mockReq, res: mockRes });
    Promise.resolve(fn(mockReq, mockRes, ...(Array.isArray(args) ? args : []))).catch((err) => {
      sseSubs.delete(sseId);
      sendMsg({
        type: "sse-error",
        sseId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  if (msg.type === "call") {
    const { id, method, args = [] } = msg;
    const target = bridge?.[method];
    if (typeof target !== "function") {
      sendMsg({ type: "result", id, ok: true, value: target });
      return;
    }
    try {
      const value = await target(...(Array.isArray(args) ? args : []));
      sendMsg({ type: "result", id, ok: true, value });
    } catch (err) {
      sendMsg({
        type: "result",
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : "",
      });
    }
  }
});

sendMsg({
  type: "ready",
  exports: Object.keys(bridge),
  mobileVaultRoot: String(bridge.MOBILE_VAULT_ROOT || ""),
});
