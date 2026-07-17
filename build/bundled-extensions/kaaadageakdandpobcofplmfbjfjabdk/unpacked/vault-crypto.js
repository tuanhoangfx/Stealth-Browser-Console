/** AES-256-GCM vault — passphrase = sync pass, salt includes noteId + domain */

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 120_000;

function enc(s) {
  return new TextEncoder().encode(s);
}

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveAesKey(passphrase, noteId, domain) {
  const pass = passphrase ?? "";
  const keyMaterial = await crypto.subtle.importKey("raw", enc(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc(`e0001-vault-v${VAULT_VERSION}:${noteId}:${domain}`),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function chromeSameSite(c) {
  const v = c?.sameSite;
  if (v === "no_restriction" || v === "strict" || v === "lax" || v === "unspecified") return v;
  return "unspecified";
}

function serializeVaultPayload(cookies) {
  const list = cookies.map((c) => {
    const row = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      secure: Boolean(c.secure),
      httpOnly: Boolean(c.httpOnly),
      sameSite: chromeSameSite(c),
      hostOnly: Boolean(c.hostOnly),
    };
    if (c.expirationDate) row.expirationDate = c.expirationDate;
    if (c.partitionKey && typeof c.partitionKey === "object") row.partitionKey = c.partitionKey;
    return row;
  });
  return JSON.stringify({ v: VAULT_VERSION, cookies: list });
}

export async function encryptVault(passphrase, noteId, domain, cookies) {
  const key = await deriveAesKey(passphrase, noteId, domain);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc(serializeVaultPayload(cookies));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return {
    ciphertext: toB64(cipher),
    iv: toB64(iv.buffer),
    cookieCount: cookies.length,
  };
}

export async function decryptVault(passphrase, noteId, domain, ciphertextB64, ivB64) {
  const key = await deriveAesKey(passphrase, noteId, domain);
  const iv = new Uint8Array(fromB64(ivB64));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromB64(ciphertextB64),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  return parsed.cookies ?? [];
}

export async function decryptVaultPayload(passphrase, noteId, domain, ciphertextB64, ivB64) {
  const key = await deriveAesKey(passphrase, noteId, domain);
  const iv = new Uint8Array(fromB64(ivB64));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromB64(ciphertextB64),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  return {
    cookies: parsed.cookies ?? [],
    storage: parsed.storage && typeof parsed.storage === "object" ? parsed.storage : null,
  };
}

export function vaultPassphrase(binding) {
  return binding.pass ?? "";
}

/** Legacy flag from Tool — extension no longer blocks vault on empty pass. */
export function vaultPassRequired(_binding) {
  return false;
}

/** Vault needs note UUID only; passphrase may be empty. */
export function canUseVault(binding) {
  return Boolean(binding?.noteId?.trim());
}
