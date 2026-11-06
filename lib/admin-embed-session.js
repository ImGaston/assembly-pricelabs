// Admin session for /admin embedded in Assembly (Internal-facing URL).
// Cookie value: `<exp>.<identity b64url>.<hmac hex>`; HMAC-SHA256 over
// `<exp>.<identity>` keyed by sha256("rf-admin-embed:" + Assembly app API key),
// so rotating the key signs everyone out. Signed here with Web Crypto (Edge
// middleware); verified with node:crypto in lib/admin-auth.js (same bytes).

export const EMBED_COOKIE = 'rf_admin_embed';
export const EMBED_HEADER = 'x-rf-assembly-user';
export const EMBED_MAX_AGE = 12 * 60 * 60; // seconds

export const EMBED_KEY_PREFIX = 'rf-admin-embed:';

function toHex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signEmbedSession(identity) {
  const apiKey = process.env.ASSEMBLY_DASHBOARD_APP_API_KEY;
  if (!apiKey) return null;
  const enc = new TextEncoder();
  const keyBytes = await crypto.subtle.digest('SHA-256', enc.encode(EMBED_KEY_PREFIX + apiKey));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const exp = Math.floor(Date.now() / 1000) + EMBED_MAX_AGE;
  const data = `${exp}.${b64url(identity)}`;
  return `${data}.${toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)))}`;
}
