import crypto from 'crypto';
import { getClientById } from './clients.js';

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validate a dashboard request.
 * @param {string} id - Client UUID from URL path (or "demo")
 * @param {string} token - Token from query parameter
 * @returns {Promise<{ valid: boolean, client: Object|null, error: string|null }>}
 */
export async function validateClient(id, token) {
  let client;
  try {
    client = await getClientById(id);
  } catch (err) {
    console.error('getClientById failed:', err.message);
    return { valid: false, client: null, error: 'lookup_failed' };
  }

  if (!client) return { valid: false, client: null, error: 'not_found' };
  if (!client.token || !token || !safeCompare(token, client.token)) {
    return { valid: false, client: null, error: 'unauthorized' };
  }

  return { valid: true, client, error: null };
}
