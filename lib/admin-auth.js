import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMBED_COOKIE, EMBED_HEADER, EMBED_KEY_PREFIX } from './admin-embed-session.js';

// Single shared password for /admin (ADMIN_PASSWORD, server-only). The session
// cookie is `<expiry>.<hmac>`, keyed off the password, so changing the password
// signs everyone out.

const COOKIE = 'rf_admin';
const MAX_AGE = 7 * 24 * 60 * 60; // seconds

function key() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error('ADMIN_PASSWORD must be set');
  return crypto.createHash('sha256').update(`rf-admin:${pw}`).digest();
}

function sign(exp) {
  return crypto.createHmac('sha256', key()).update(String(exp)).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function checkPassword(input) {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && typeof input === 'string' && safeEqual(input, pw);
}

export function startSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  cookies().set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: MAX_AGE,
  });
}

export function endSession() {
  cookies().set(COOKIE, '', { path: '/admin', maxAge: 0 });
}

function hasSession() {
  const value = cookies().get(COOKIE)?.value || '';
  const [exp, mac] = value.split('.');
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(mac, sign(exp));
}

// Assembly Internal-facing URL session (see middleware.js / admin-embed-session.js).
function embedIdentity() {
  const fromToken = headers().get(EMBED_HEADER); // set only by middleware after verifying ?token=
  if (fromToken) return decodeURIComponent(fromToken);
  const apiKey = process.env.ASSEMBLY_DASHBOARD_APP_API_KEY;
  const value = cookies().get(EMBED_COOKIE)?.value || '';
  const [exp, id, mac] = value.split('.');
  if (!apiKey || !exp || !id || !mac || Number(exp) < Date.now() / 1000) return null;
  const key = crypto.createHash('sha256').update(EMBED_KEY_PREFIX + apiKey).digest();
  const expected = crypto.createHmac('sha256', key).update(`${exp}.${id}`).digest('hex');
  if (!safeEqual(mac, expected)) return null;
  return Buffer.from(id, 'base64url').toString('utf8');
}

/** How the current request is signed in: { via: 'assembly', identity } | { via: 'password' } | null. */
export function adminSession() {
  const identity = embedIdentity();
  if (identity) return { via: 'assembly', identity };
  return hasSession() ? { via: 'password' } : null;
}

/** Redirects to the login page unless the request carries a valid admin session. */
export function requireAdmin() {
  if (!adminSession()) redirect('/admin/login');
}
