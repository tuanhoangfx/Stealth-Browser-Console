"use strict";

/**
 * Fetch latest Microsoft / security code from a getnada.com disposable inbox.
 * API: GET https://getnada.com/api/v1/inboxes/{email} then /messages/{uid}
 */

function extractSecurityCode(text) {
  const raw = String(text || "");
  const patterns = [
    /security\s*code[:\s]*([0-9]{6,8})/i,
    /verification\s*code[:\s]*([0-9]{6,8})/i,
    /\b([0-9]{6,8})\b/,
  ];
  for (const re of patterns) {
    const match = raw.match(re);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function fetchJson(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) {
      const err = new Error(`getnada API 404 (legacy /api/v1 removed): ${url}`);
      err.code = "GETNADA_API_GONE";
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} email getnada address
 * @param {{ timeoutMs?: number, sinceMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, code: string, subject: string, error?: string }>}
 */
async function pollGetnadaSecurityCode(email, opts = {}) {
  const address = String(email || "")
    .trim()
    .toLowerCase();
  if (!/@getnada\.com$/i.test(address)) {
    return { ok: false, code: "", subject: "", error: "not a getnada.com address" };
  }
  // Legacy getnada /api/v1 is gone (404). Fail fast — caller should prefer password / manual OTC.
  try {
    await fetchJson(`https://getnada.com/api/v1/inboxes/${encodeURIComponent(address)}`, 8_000);
  } catch (error) {
    return {
      ok: false,
      code: "",
      subject: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const timeoutMs = Math.min(Number(opts.timeoutMs) || 30_000, 30_000);
  const sinceMs = Number(opts.sinceMs) || Date.now() - 120_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const inbox = await fetchJson(`https://getnada.com/api/v1/inboxes/${encodeURIComponent(address)}`);
      const msgs = Array.isArray(inbox?.msgs)
        ? inbox.msgs
        : Array.isArray(inbox)
          ? inbox
          : Array.isArray(inbox?.messages)
            ? inbox.messages
            : [];
      const sorted = [...msgs].sort((a, b) => {
        const ta = Number(a.r || a.date || a.timestamp || 0);
        const tb = Number(b.r || b.date || b.timestamp || 0);
        return tb - ta;
      });
      for (const row of sorted) {
        const ts = Number(row.r || row.date || row.timestamp || 0) * (String(row.r || "").length <= 10 ? 1000 : 1);
        if (ts && ts < sinceMs) continue;
        const uid = row.uid || row.id || row.message_id;
        if (!uid) continue;
        const body = await fetchJson(`https://getnada.com/api/v1/messages/${encodeURIComponent(uid)}`);
        const blob = [body?.subject, body?.text, body?.html, body?.message, JSON.stringify(body)].join("\n");
        const code = extractSecurityCode(blob);
        if (code) {
          return { ok: true, code, subject: String(body?.subject || row.subject || "") };
        }
      }
    } catch (error) {
      if (error?.code === "GETNADA_API_GONE") {
        return { ok: false, code: "", subject: "", error: error.message };
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  return { ok: false, code: "", subject: "", error: `No getnada code within ${timeoutMs}ms` };
}

module.exports = {
  pollGetnadaSecurityCode,
  extractSecurityCode,
};
