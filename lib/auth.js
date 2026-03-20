import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const clientConfig = require('../config/clients.json');

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validate a client request.
 * @param {string} slug - Client slug from URL path
 * @param {string} token - Token from query parameter
 * @returns {{ valid: boolean, client: Object|null, error: string|null }}
 */
function validateClient(slug, token) {
  const client = clientConfig.clients[slug];

  if (!client) {
    return { valid: false, client: null, error: 'not_found' };
  }

  if (!token || !safeCompare(token, client.token)) {
    return { valid: false, client: null, error: 'unauthorized' };
  }

  return { valid: true, client: { ...client, slug }, error: null };
}

export { validateClient };
