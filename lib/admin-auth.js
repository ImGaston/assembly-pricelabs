import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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

/** Redirects to the login page unless the request carries a valid admin session. */
export function requireAdmin() {
  if (!hasSession()) redirect('/admin/login');
}
