'use strict';

const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { encrypt, decrypt, randomToken } = require('../utils/crypto');
const { EmailAccount } = require('../models');
const log = require('../utils/logger');

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

function newClient() {
  return new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );
}

/**
 * Which deep links the callback is allowed to redirect back to.
 *
 * The app tells us where to send it, so this MUST be an allowlist — otherwise
 * it is an open redirect, and an attacker could bounce a fresh auth code to a
 * URL they control.
 *
 *   nrynmail://…       a standalone (built) app, from app.json "scheme"
 *   exp://…  exp+…://  Expo Go and dev clients, whose host is the LAN IP
 *   http://localhost…  a browser or curl during development
 */
function isAllowedRedirect(uri) {
  if (!uri) return false;
  const s = String(uri);
  if (s.includes('\n') || s.includes('\r')) return false; // header-splitting
  const prefixes = [
    `${env.appScheme}://`,
    'exp://',
    'exp+',
    'http://localhost',
    'http://127.0.0.1',
    'http://10.',
    'http://192.168.',
    'http://172.',
  ];
  if (env.frontendUrl) prefixes.push(env.frontendUrl);
  return prefixes.some((p) => s.startsWith(p));
}

/**
 * Signed, short-lived state. Google's redirect carries no cookies of ours, so
 * state is the only CSRF protection the callback has — and it is also how the
 * app's chosen redirect survives the round trip without being tamperable.
 */
function makeState(appRedirect) {
  return jwt.sign({ n: randomToken(12), r: appRedirect || '' }, env.jwtSecret, {
    expiresIn: '10m',
  });
}

/** Returns the decoded payload, or null when the state is missing or forged. */
function verifyState(state) {
  try {
    return jwt.verify(state, env.jwtSecret);
  } catch (err) {
    log.warn('oauth', 'rejected callback with bad state: ' + err.message);
    return null;
  }
}

function authUrl(appRedirect) {
  return newClient().generateAuthUrl({
    access_type: 'offline',  // without this there is no refresh_token
    prompt: 'consent',       // force it on every authorisation so we never miss it
    include_granted_scopes: true,
    scope: SCOPES,
    state: makeState(appRedirect),
  });
}

async function exchangeCode(code) {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

async function fetchProfile(client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data; // { id, email, name, picture, ... }
}

/**
 * Every Gmail call goes through here. Refreshes on expiry, writes the new token
 * back encrypted, and flips the account to `reauth_required` on invalid_grant
 * (the user revoked access) instead of failing silently every 3 minutes.
 */
async function withFreshToken(account, fn) {
  const client = newClient();
  client.setCredentials({
    access_token: decrypt(account.accessToken),
    refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined,
    expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
  });

  client.on('tokens', async (tokens) => {
    try {
      const patch = {};
      if (tokens.access_token) patch.accessToken = encrypt(tokens.access_token);
      if (tokens.refresh_token) patch.refreshToken = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) patch.tokenExpiry = new Date(tokens.expiry_date);
      if (Object.keys(patch).length) {
        await EmailAccount.updateOne({ _id: account._id }, { $set: patch });
        log.debug('oauth', 'refreshed token for account ' + account._id);
      }
    } catch (err) {
      log.error('oauth', 'could not persist refreshed token: ' + err.message);
    }
  });

  try {
    return await fn(client);
  } catch (err) {
    const reason =
      (err && err.response && err.response.data && err.response.data.error) || err.message || '';
    if (String(reason).includes('invalid_grant') || String(reason).includes('unauthorized_client')) {
      await EmailAccount.updateOne(
        { _id: account._id },
        { $set: { status: 'reauth_required', lastError: 'Google access was revoked or expired' } }
      );
      log.warn('oauth', `account ${account._id} needs re-auth (${reason})`);
    }
    throw err;
  }
}

/** Best-effort revoke at Google; we mark the account revoked either way. */
async function revoke(account) {
  try {
    const client = newClient();
    const token = account.refreshToken ? decrypt(account.refreshToken) : decrypt(account.accessToken);
    await client.revokeToken(token);
  } catch (err) {
    log.warn('oauth', 'revoke at Google failed (continuing): ' + err.message);
  }
}

module.exports = {
  SCOPES,
  authUrl,
  verifyState,
  isAllowedRedirect,
  exchangeCode,
  fetchProfile,
  withFreshToken,
  revoke,
  newClient,
};
