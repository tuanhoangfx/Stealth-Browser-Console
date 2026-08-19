/**
 * Persistent PowerShell worker for hot-path taskbar apply (avoids ~3–4s spawn per call).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const { resolvePowerShell, resolveElectronLibScript } = require("./powershell-exec.cjs");

const WORKER_PS1 = resolveElectronLibScript("stealth-taskbar-apply-worker.ps1");

/** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
let worker = null;
/** @type {import('node:readline').Interface | null} */
let rl = null;
let seq = 0;
let ready = false;
/** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const pending = new Map();
/** Serialize stdin writes — PS worker is one-line-at-a-time. */
let applyTail = Promise.resolve();

function rejectAllPending(error) {
  for (const [id, job] of pending.entries()) {
    clearTimeout(job.timer);
    job.reject(error);
    pending.delete(id);
  }
}

function handleWorkerLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.ready === true) {
    ready = true;
    return;
  }
  const id = Number(msg.id);
  const job = pending.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  pending.delete(id);
  job.resolve(msg);
}

function spawnWorker() {
  if (worker && !worker.killed) return worker;
  ready = false;
  worker = spawn(
    resolvePowerShell(),
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", WORKER_PS1],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  rl = readline.createInterface({ input: worker.stdout });
  rl.on("line", handleWorkerLine);
  worker.stderr.on("data", () => undefined);
  worker.on("exit", () => {
    ready = false;
    worker = null;
    if (rl) {
      rl.close();
      rl = null;
    }
    rejectAllPending(new Error("taskbar-apply-worker-exited"));
  });
  return worker;
}

async function waitWorkerReady(timeoutMs = 15_000) {
  if (ready) return;
  spawnWorker();
  const deadline = Date.now() + timeoutMs;
  while (!ready && Date.now() < deadline) {
    if (!worker || worker.killed) throw new Error("taskbar-apply-worker-failed");
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!ready) throw new Error("taskbar-apply-worker-timeout");
}

/**
 * Run exclusive work one-at-a-time. Timeout starts when the job begins, not
 * when it is queued — burst-open used to pile 13+ stdin lines and later
 * profiles hit request-timeout before the serial PS worker reached them.
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueueExclusive(work) {
  const run = () => work();
  const next = applyTail.then(run, run);
  applyTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * @param {object} payload
 * @param {{ timeoutMs?: number }} [opts]
 */
async function runTaskbarApplyWorker(payload, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 12_000;
  return enqueueExclusive(async () => {
    await waitWorkerReady();
    if (!worker || worker.killed) throw new Error("taskbar-apply-worker-unavailable");
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("taskbar-apply-worker-request-timeout"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  });
}

function shutdownTaskbarApplyWorker() {
  rejectAllPending(new Error("taskbar-apply-worker-shutdown"));
  if (worker && !worker.killed) {
    try {
      worker.stdin.end();
      worker.kill();
    } catch {
      /* ignore */
    }
  }
  worker = null;
  ready = false;
  if (rl) {
    rl.close();
    rl = null;
  }
}

process.once("exit", shutdownTaskbarApplyWorker);

module.exports = {
  enqueueExclusive,
  runTaskbarApplyWorker,
  shutdownTaskbarApplyWorker,
  waitWorkerReady,
};
