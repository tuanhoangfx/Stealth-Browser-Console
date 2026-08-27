/**
 * Persistent PowerShell workers for hot-path taskbar apply (avoids ~3–4s spawn per call).
 * Pool of 6 — burst-open used to serialize 13+ profiles on one worker and starve later stamps.
 */
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const { resolvePowerShell, resolveElectronLibScript } = require("./powershell-exec.cjs");

const WORKER_PS1 = resolveElectronLibScript("stealth-taskbar-apply-worker.ps1");
const WORKER_POOL_SIZE = 6;

/** @typedef {{ worker: import('node:child_process').ChildProcessWithoutNullStreams | null, rl: import('node:readline').Interface | null, ready: boolean, pending: Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>, tail: Promise<unknown>, queued: number }} WorkerSlot */

/** @returns {WorkerSlot} */
function createSlot() {
  return {
    worker: null,
    rl: null,
    ready: false,
    pending: new Map(),
    tail: Promise.resolve(),
    queued: 0,
  };
}

/** @type {WorkerSlot[]} */
const slots = Array.from({ length: WORKER_POOL_SIZE }, createSlot);

/** Serialize generic exclusive work (tests / one-at-a-time helpers). */
let applyTail = Promise.resolve();
let seq = 0;

function rejectSlotPending(slot, error) {
  for (const [id, job] of slot.pending.entries()) {
    clearTimeout(job.timer);
    job.reject(error);
    slot.pending.delete(id);
  }
}

function handleWorkerLine(slot, line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.ready === true) {
    slot.ready = true;
    return;
  }
  const id = Number(msg.id);
  const job = slot.pending.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  slot.pending.delete(id);
  job.resolve(msg);
}

function spawnWorkerOn(slot) {
  if (slot.worker && !slot.worker.killed) return slot.worker;
  slot.ready = false;
  slot.worker = spawn(
    resolvePowerShell(),
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", WORKER_PS1],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  slot.rl = readline.createInterface({ input: slot.worker.stdout });
  slot.rl.on("line", (line) => handleWorkerLine(slot, line));
  slot.worker.stderr.on("data", () => undefined);
  slot.worker.on("exit", () => {
    slot.ready = false;
    slot.worker = null;
    if (slot.rl) {
      slot.rl.close();
      slot.rl = null;
    }
    rejectSlotPending(slot, new Error("taskbar-apply-worker-exited"));
  });
  return slot.worker;
}

async function waitSlotReady(slot, timeoutMs = 15_000) {
  if (slot.ready) return;
  spawnWorkerOn(slot);
  const deadline = Date.now() + timeoutMs;
  while (!slot.ready && Date.now() < deadline) {
    if (!slot.worker || slot.worker.killed) throw new Error("taskbar-apply-worker-failed");
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!slot.ready) throw new Error("taskbar-apply-worker-timeout");
}

function pickSlot() {
  let best = slots[0];
  for (const slot of slots) {
    if (slot.queued < best.queued) best = slot;
  }
  return best;
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
 * @template T
 * @param {WorkerSlot} slot
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueueOnSlot(slot, work) {
  slot.queued += 1;
  const run = async () => {
    try {
      return await work();
    } finally {
      slot.queued = Math.max(0, slot.queued - 1);
    }
  };
  const next = slot.tail.then(run, run);
  slot.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Spread work across the worker pool (burst-open / guard).
 * @template T
 * @param {(slot: WorkerSlot) => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueuePooled(work) {
  const slot = pickSlot();
  return enqueueOnSlot(slot, () => work(slot));
}

async function waitWorkerReady(timeoutMs = 15_000) {
  await waitSlotReady(slots[0], timeoutMs);
}

/**
 * @param {object} payload
 * @param {{ timeoutMs?: number }} [opts]
 */
async function runTaskbarApplyWorker(payload, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 12_000;
  return enqueuePooled(async (slot) => {
    await waitSlotReady(slot);
    if (!slot.worker || slot.worker.killed) throw new Error("taskbar-apply-worker-unavailable");
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        slot.pending.delete(id);
        reject(new Error("taskbar-apply-worker-request-timeout"));
      }, timeoutMs);
      slot.pending.set(id, { resolve, reject, timer });
      slot.worker.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  });
}

function shutdownSlot(slot) {
  rejectSlotPending(slot, new Error("taskbar-apply-worker-shutdown"));
  if (slot.worker && !slot.worker.killed) {
    try {
      slot.worker.stdin.end();
      slot.worker.kill();
    } catch {
      /* ignore */
    }
  }
  slot.worker = null;
  slot.ready = false;
  slot.queued = 0;
  if (slot.rl) {
    slot.rl.close();
    slot.rl = null;
  }
}

function shutdownTaskbarApplyWorker() {
  for (const slot of slots) shutdownSlot(slot);
}

process.once("exit", shutdownTaskbarApplyWorker);

module.exports = {
  WORKER_POOL_SIZE,
  enqueueExclusive,
  enqueuePooled,
  runTaskbarApplyWorker,
  shutdownTaskbarApplyWorker,
  waitWorkerReady,
};
