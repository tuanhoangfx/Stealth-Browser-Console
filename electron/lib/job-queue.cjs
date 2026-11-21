"use strict";
/**
 * Job queue async cho BrowserHub — chạy automation theo LÔ (mặc định dùng 20–30 profile
 * đồng thời; catalog có thể 10k–50k nhưng chỉ một nhúm chạy cùng lúc).
 *
 * Tính năng cho batch lớn:
 *  - concurrency cấu hình (STEALTH_JOB_CONCURRENCY) — số profile chạy song song.
 *  - dedupe theo `key` (thường = profileId): không bao giờ 2 job chồng lên cùng 1 profile.
 *  - retry + backoff luỹ thừa cho job thất bại tạm thời.
 *  - jitter: trễ ngẫu nhiên trước khi chạy để tránh launch lockstep (chống fingerprint timing).
 *
 * API: enqueue({ type, key?, meta?, run, retries?, retryDelayMs?, jitterMs? }) → jobId
 *   - run(emit) trả result; emit(evt) đẩy event ra buffer/SSE.
 *   - get(id), list(), subscribe(id, fn)
 */
const { randomUUID } = require("node:crypto");

const MAX_EVENTS_BUFFER = 500;
const MAX_FINISHED_JOBS = 200;
const FINISHED_JOB_TTL_MS = 30 * 60 * 1000;
const MAX_FINISHED_EVENTS = 50;
const MAX_FINISHED_RESULT_BYTES = 64 * 1024;
const MAX_FINISHED_ERROR_CHARS = 4000;
const FINISHED_JOB_STATUSES = new Set(["done", "error", "completed", "failed", "cancelled"]);

function compactFinishedJobPayload(job) {
  if (Array.isArray(job.events) && job.events.length > MAX_FINISHED_EVENTS) {
    job.events = job.events.slice(-MAX_FINISHED_EVENTS);
  }
  if (typeof job.error === "string" && job.error.length > MAX_FINISHED_ERROR_CHARS) {
    job.error = `${job.error.slice(0, MAX_FINISHED_ERROR_CHARS)}...[truncated]`;
  }
  if (job.result !== null && job.result !== undefined) {
    try {
      const serialized = typeof job.result === "string" ? job.result : JSON.stringify(job.result);
      if (serialized && serialized.length > MAX_FINISHED_RESULT_BYTES) {
        job.result = {
          truncated: true,
          originalBytes: serialized.length,
          preview: serialized.slice(0, 2048),
        };
      }
    } catch {
      job.result = { truncated: true, nonSerializable: true };
    }
  }
}

function jitterDelay(maxMs) {
  if (!maxMs || maxMs <= 0) return 0;
  return Math.floor(Math.random() * maxMs);
}

class JobQueue {
  #concurrency;
  #maxFinishedJobs;
  #finishedJobTtlMs;
  #running = 0;
  /** @type {Array<string>} */
  #pending = [];
  /** @type {Map<string, object>} */
  #jobs = new Map();
  /** @type {Map<string, Function>} */
  #runners = new Map();
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();
  /** key → jobId đang active (dedupe). */
  #activeKeys = new Map();

  constructor({
    concurrency = 1,
    maxFinishedJobs = MAX_FINISHED_JOBS,
    finishedJobTtlMs = FINISHED_JOB_TTL_MS,
  } = {}) {
    this.#concurrency = Math.max(1, Number(concurrency) || 1);
    this.#maxFinishedJobs = Math.max(1, Number(maxFinishedJobs) || MAX_FINISHED_JOBS);
    this.#finishedJobTtlMs = Math.max(1000, Number(finishedJobTtlMs) || FINISHED_JOB_TTL_MS);
  }

  get concurrency() {
    return this.#concurrency;
  }

  /**
   * @param {{ type: string, key?: string, meta?: object, run: Function,
   *           retries?: number, retryDelayMs?: number, jitterMs?: number }} spec
   * @returns {string} jobId (nếu trùng key đang active → trả jobId hiện có)
   */
  enqueue(spec) {
    const { type, key = null, meta = {}, run, retries = 0, retryDelayMs = 1500, jitterMs = 0 } = spec;

    if (key && this.#activeKeys.has(key)) {
      return this.#activeKeys.get(key); // dedupe — không tạo job chồng cho cùng profile
    }

    const id = randomUUID();
    const job = {
      id,
      type: String(type || "job"),
      key,
      meta,
      status: "queued",
      attempt: 0,
      maxAttempts: Math.max(1, Number(retries) + 1),
      retryDelayMs: Math.max(0, Number(retryDelayMs) || 0),
      jitterMs: Math.max(0, Number(jitterMs) || 0),
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
      events: []
    };
    this.#jobs.set(id, job);
    this.#runners.set(id, run);
    this.#pending.push(id);
    if (key) this.#activeKeys.set(key, id);
    this.#emit(id, { event: "queued", status: "queued" });
    queueMicrotask(() => this.#drain());
    return id;
  }

  get(id) {
    const j = this.#jobs.get(String(id));
    if (!j) return null;
    return {
      id: j.id, type: j.type, key: j.key, meta: j.meta, status: j.status,
      attempt: j.attempt, maxAttempts: j.maxAttempts,
      createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt,
      result: j.result, error: j.error, events: j.events
    };
  }

  list() {
    return [...this.#jobs.values()].map((j) => ({
      id: j.id, type: j.type, key: j.key, status: j.status,
      attempt: j.attempt, createdAt: j.createdAt, finishedAt: j.finishedAt
    }));
  }

  stats() {
    let queued = 0, running = 0, done = 0, error = 0;
    for (const j of this.#jobs.values()) {
      if (j.status === "queued") queued += 1;
      else if (j.status === "running") running += 1;
      else if (j.status === "done" || j.status === "completed") done += 1;
      else if (j.status === "error" || j.status === "failed" || j.status === "cancelled") error += 1;
    }
    return { concurrency: this.#concurrency, queued, running, done, error, total: this.#jobs.size };
  }

  subscribe(id, listener) {
    const job = this.#jobs.get(String(id));
    if (!job) return null;
    for (const evt of job.events) listener(evt);
    if (FINISHED_JOB_STATUSES.has(job.status)) {
      listener({ event: "end", status: job.status, result: job.result, error: job.error });
      return () => {};
    }
    let set = this.#listeners.get(String(id));
    if (!set) { set = new Set(); this.#listeners.set(String(id), set); }
    set.add(listener);
    return () => set.delete(listener);
  }

  #emit(id, evt) {
    const job = this.#jobs.get(id);
    if (!job) return;
    const stamped = { ...evt, time: new Date().toISOString() };
    job.events.push(stamped);
    if (job.events.length > MAX_EVENTS_BUFFER) job.events.shift();
    const set = this.#listeners.get(id);
    if (set) for (const fn of set) { try { fn(stamped); } catch { /* listener lỗi không phá job */ } }
  }

  #pruneFinishedJobs(nowMs = Date.now()) {
    const finished = [];
    for (const [id, job] of this.#jobs.entries()) {
      if (!job || job.status === "queued" || job.status === "running") continue;
      if (!FINISHED_JOB_STATUSES.has(job.status)) continue;
      const finishedMs =
        typeof job._finishedAtMs === "number"
          ? job._finishedAtMs
          : job.finishedAt
            ? Date.parse(job.finishedAt) || nowMs
            : nowMs;
      if (nowMs - finishedMs > this.#finishedJobTtlMs) {
        this.#jobs.delete(id);
        this.#listeners.delete(id);
        this.#runners.delete(id);
      } else {
        finished.push({ id, finishedMs });
      }
    }
    if (finished.length > this.#maxFinishedJobs) {
      finished.sort((a, b) => a.finishedMs - b.finishedMs);
      const excess = finished.length - this.#maxFinishedJobs;
      for (let i = 0; i < excess; i += 1) {
        const id = finished[i].id;
        this.#jobs.delete(id);
        this.#listeners.delete(id);
        this.#runners.delete(id);
      }
    }
  }

  #finish(job, status) {
    const nowMs = Date.now();
    job.status = status;
    job.finishedAt = new Date(nowMs).toISOString();
    job._finishedAtMs = nowMs;
    this.#emit(job.id, { event: "end", status, result: job.result, error: job.error });
    compactFinishedJobPayload(job);
    this.#runners.delete(job.id);
    if (job.key && this.#activeKeys.get(job.key) === job.id) this.#activeKeys.delete(job.key);
    const set = this.#listeners.get(job.id);
    if (set) {
      set.clear();
      this.#listeners.delete(job.id);
    }
    this.#pruneFinishedJobs(nowMs);
  }

  async #drain() {
    while (this.#running < this.#concurrency && this.#pending.length) {
      const id = this.#pending.shift();
      const job = this.#jobs.get(id);
      const run = this.#runners.get(id);
      if (!job || !run) continue;
      this.#running += 1;
      this.#execute(job, run).finally(() => {
        this.#running -= 1;
        this.#drain();
      });
    }
  }

  async #execute(job, run) {
    job.attempt += 1;
    job.status = "running";
    job.startedAt = job.startedAt || new Date().toISOString();
    this.#emit(job.id, { event: "start", status: "running", attempt: job.attempt });

    const jitter = jitterDelay(job.jitterMs);
    if (jitter) await new Promise((r) => setTimeout(r, jitter));

    try {
      const result = await run((evt) => this.#emit(job.id, evt));
      job.result = result ?? null;
      this.#finish(job, "done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempt < job.maxAttempts) {
        // backoff luỹ thừa rồi đẩy lại hàng đợi.
        const delay = job.retryDelayMs * 2 ** (job.attempt - 1);
        this.#emit(job.id, { event: "retry", attempt: job.attempt, nextInMs: delay, error: msg });
        job.status = "queued";
        setTimeout(() => { this.#pending.push(job.id); this.#runners.set(job.id, run); this.#drain(); }, delay);
      } else {
        job.error = msg;
        this.#finish(job, "error");
      }
    }
  }
}

module.exports = { JobQueue };
