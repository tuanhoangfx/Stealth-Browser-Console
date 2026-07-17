import { parseApiErrorBody, rpcHeaders } from "./auth-session.js";

function vaultProbeFailed(text) {
  if (/record\s+"v_note"\s+has\s+no\s+field/i.test(text)) return true;
  if (/sync_pass_hash/i.test(text) && !/note not found/i.test(text)) return true;
  if (/PGRST202|does not exist/i.test(text)) return true;
  if (/note not found/i.test(text)) return false;
  return false;
}

/** Read-only upsert probe — fake note UUID only (never overwrite a real vault row). */
async function probeVaultUpsert(auth) {
  const res = await fetch(`${auth.supabase_url}/rest/v1/rpc/note_vault_upsert`, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_note_id: "00000000-0000-0000-0000-000000000000",
      p_domain: ".probe",
      p_pass: null,
      p_ciphertext: "dGVzdA==",
      p_iv: "dGVzdA==",
      p_cookie_count: 0,
      p_source_browser: "schema-probe",
    }),
  });
  return res.text();
}

/** True when vault RPC exists and stale v_note / sync_pass_hash bug is gone. */
export async function probeCookieSchemaOk(auth, _bindings = []) {
  if (!auth?.supabase_url || !auth?.supabase_anon_key) return false;
  try {
    const text = await probeVaultUpsert(auth);
    if (/record\s+"v_note"\s+has\s+no\s+field/i.test(text)) return false;
    if (/sync_pass_hash/i.test(text) && !/note not found/i.test(text)) return false;
    if (/PGRST202|does not exist/i.test(text)) return false;
    if (/note not found/i.test(text)) return true;
    return !vaultProbeFailed(text);
  } catch {
    return false;
  }
}

export function isSchemaRelatedVaultError(msg) {
  return /note_vault_upsert|PGRST202|does not exist|schema cache|sync_pass_hash/i.test(
    String(msg ?? ""),
  );
}
