/**
 * BrowserHub client (TypeScript) — SDK chia sẻ cho tool workspace gọi P0003.
 *
 * Zero-dependency (fetch + EventSource API chuẩn). Hỗ trợ auth token, CDP
 * passthrough và job queue async.
 *
 * @example
 *   const hub = new BrowserHub({ token: process.env.STEALTH_API_TOKEN });
 *   await hub.launch(profileId);
 *   const { endpoint } = await hub.cdpInfo(profileId);
 *   const browser = await chromium.connectOverCDP(endpoint);
 */

export interface BrowserHubOptions {
  baseUrl?: string;
  token?: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  status: string;
  running: boolean;
  debugPort?: number;
}

export interface CdpInfo {
  ok: boolean;
  port: number;
  endpoint: string;
  webSocketDebuggerUrl: string;
  browser?: string;
  error?: string;
}

export interface JobEvent {
  event: string;
  status?: string;
  result?: unknown;
  error?: string;
  [k: string]: unknown;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:6003";

export class BrowserHubError extends Error {}

export class BrowserHub {
  private baseUrl: string;
  private token: string;

  constructor(opts: BrowserHubOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = opts.token ?? "";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new BrowserHubError(`${method} ${path} → ${res.status}: ${json?.error ?? res.statusText}`);
    }
    return json as T;
  }

  // ── Health / profiles ──────────────────────────────────────────────────
  health() {
    return this.req("GET", "/api/health");
  }

  async listProfiles(): Promise<ProfileSummary[]> {
    const r = await this.req<{ profiles: ProfileSummary[] }>("GET", "/api/profiles");
    return r.profiles ?? [];
  }

  /** Phân trang cho catalog lớn (10k–50k). */
  listProfilesPage(opts: {
    limit?: number; offset?: number; search?: string; group?: string;
    status?: string; sort?: string; dir?: "asc" | "desc";
  } = {}): Promise<{ profiles: ProfileSummary[]; total: number; limit: number; offset: number }> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return this.req("GET", `/api/profiles?${qs.toString()}`);
  }

  /** Health-check proxy + geoip-consistency. */
  checkProxy(arg: { profileId?: string; proxy?: string }) {
    const body: Record<string, string> = {};
    if (arg.profileId) body.profile_id = arg.profileId;
    if (arg.proxy) body.proxy = arg.proxy;
    return this.req("POST", "/api/proxy/check", body);
  }

  jobsStats() {
    return this.req("GET", "/api/jobs/stats");
  }

  launch(profileId: string) {
    return this.req("POST", `/api/profiles/${profileId}/launch`);
  }

  close(profileId: string) {
    return this.req("POST", `/api/profiles/${profileId}/close`);
  }

  status(profileId: string) {
    return this.req("GET", `/api/profiles/${profileId}/status`);
  }

  // ── CDP passthrough ────────────────────────────────────────────────────
  cdpInfo(profileId: string): Promise<CdpInfo> {
    return this.req<CdpInfo>("GET", `/api/profiles/${profileId}/cdp`);
  }

  // ── Automation đồng bộ ─────────────────────────────────────────────────
  openUrl(profileId: string, targetUrl: string, opts: Record<string, unknown> = {}) {
    return this.req("POST", "/api/automation/open-url", {
      profile_id: profileId,
      target_url: targetUrl,
      ...opts,
    });
  }

  // ── Job queue async ────────────────────────────────────────────────────
  async enqueue(type: "open-url" | "fb-create-pages", payload: Record<string, unknown>): Promise<string> {
    const r = await this.req<{ jobId: string }>("POST", "/api/jobs", { type, payload });
    return r.jobId;
  }

  job(jobId: string) {
    return this.req("GET", `/api/jobs/${jobId}`);
  }

  /** Stream tiến trình job qua SSE (parse thủ công vì cần header auth). */
  async *streamJob(jobId: string): AsyncGenerator<JobEvent> {
    const res = await fetch(`${this.baseUrl}/api/jobs/${jobId}/events`, { headers: this.headers() });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const evt = JSON.parse(line.slice(6)) as JobEvent;
        yield evt;
        if (evt.event === "end") return;
      }
    }
  }
}
