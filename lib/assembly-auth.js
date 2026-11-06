// Assembly Custom App session token (the `?token=` Assembly appends to an app's
// Internal-facing URL when it renders it in the dashboard iframe).
//
// Format, mirrored from @assembly-js/node-sdk (utils/crypto-web): hex string =
// 16-byte IV + AES-128-CBC ciphertext. The AES key is the first 128 bits of
// HMAC-SHA256(apiKey, ""). Plaintext is JSON with string values:
// { workspaceId, internalUserId?, clientId?, companyId?, tokenId?, baseUrl? }.
//
// CBC has no MAC, so a decrypted payload alone is not proof of identity: we
// also look the internal user up with the API key (GET /v1/internal-users/{id}),
// which only succeeds for a real internal user of this workspace.
//
// Web Crypto only — this runs in middleware (Edge runtime). Server-only: the
// API key never reaches the browser.

const API_BASE = 'https://api.assembly.com';
const USER_TTL_MS = 10 * 60 * 1000;
const userCache = new Map(); // internalUserId -> { user, at }

function apiKey() {
  return process.env.ASSEMBLY_DASHBOARD_APP_API_KEY || '';
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length < 64 || hex.length % 2 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function aesKey(key) {
  const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array(0)));
  return crypto.subtle.importKey('raw', digest.slice(0, 16), { name: 'AES-CBC' }, false, ['decrypt']);
}

/** Decrypts an Assembly session token. Returns the payload or null (never throws). */
export async function decryptAssemblyToken(token) {
  const key = apiKey();
  const bytes = hexToBytes(token);
  if (!key || !bytes) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bytes.slice(0, 16) }, await aesKey(key), bytes.slice(16));
    const json = JSON.parse(new TextDecoder().decode(plain));
    if (!json || typeof json.workspaceId !== 'string') return null;
    if (!Object.values(json).every((v) => typeof v === 'string')) return null;
    return json;
  } catch {
    return null;
  }
}

async function fetchInternalUser(id) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const res = await fetch(`${API_BASE}/v1/internal-users/${encodeURIComponent(id)}`, {
    headers: { 'X-API-KEY': apiKey(), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = await res.json();
  const user = body && body.id === id
    ? { id: body.id, email: body.email || '', name: [body.givenName, body.familyName].filter(Boolean).join(' '), role: body.role || '' }
    : null;
  if (user) userCache.set(id, { user, at: Date.now() });
  return user;
}

/**
 * Resolves an Assembly token to a verified internal user, or null. Client
 * tokens (no internalUserId) are rejected: the admin is internal-only.
 */
export async function verifyAssemblyInternalUser(token) {
  const payload = await decryptAssemblyToken(token);
  const id = payload?.internalUserId;
  if (!id || !/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  try {
    const user = await fetchInternalUser(id);
    return user ? { ...user, workspaceId: payload.workspaceId } : null;
  } catch {
    return null;
  }
}
