'use strict';

/**
 * One-time authorisation codes for the mobile hand-off.
 *
 * After Google consent the backend cannot hand the app a cookie — React Native
 * has no cookie jar — so it redirects to the app's deep link. Putting the real
 * session JWT in that URL would leave a long-lived credential in a URL that
 * browsers, OS logs and clipboards can retain. Instead the URL carries a short
 * random code, and the app trades it for the JWT over HTTPS POST exactly once.
 *
 * In memory on purpose: the window is 2 minutes, so surviving a restart has no
 * value, and there is nothing to clean up in the database.
 */

const crypto = require('crypto');

const TTL_MS = 2 * 60 * 1000;
const codes = new Map(); // code -> { userId, expiresAt }

function issue(userId) {
  sweep();
  const code = crypto.randomBytes(24).toString('base64url');
  codes.set(code, { userId: String(userId), expiresAt: Date.now() + TTL_MS });
  return code;
}

/** Returns the userId and burns the code, or null if unknown/expired/reused. */
function redeem(code) {
  sweep();
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code); // single use, even if it turns out to be expired
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

function sweep() {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}

module.exports = { issue, redeem, TTL_MS };
