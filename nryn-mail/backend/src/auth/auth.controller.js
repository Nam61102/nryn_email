'use strict';

const env = require('../config/env');
const log = require('../utils/logger');
const oauth = require('./google.oauth');
const codeStore = require('./code.store');
const { encrypt } = require('../utils/crypto');
const { User, EmailAccount } = require('../models');
const { issueSession, clearSession, signToken } = require('./session.middleware');
const repo = require('../email/email.repo');
const sync = require('../gmail/gmail.sync.service');
const processor = require('../email/email.processor');

function googleNotConfigured(res) {
  return res.status(503).json({
    error: 'google_oauth_not_configured',
    missing: env.missingGoogle,
    hint:
      'Create an OAuth 2.0 Client ID (type: Web application) in Google Cloud Console → ' +
      'APIs & Services → Credentials, add ' + env.google.redirectUri +
      ' as an authorized redirect URI, then put the values in backend/.env.',
  });
}

/**
 * GET /api/auth/google/url?redirect=<app deep link>
 *
 * The mobile app passes the URI Expo generated for it (`exp://192.168.x.x:8081/--/auth`
 * in Expo Go, `nrynmail://auth` in a build). It travels inside the signed state,
 * so it cannot be swapped en route, and it is checked against an allowlist here
 * so this never becomes an open redirect.
 */
function authUrl(req, res) {
  if (!env.googleConfigured) return googleNotConfigured(res);

  const requested = req.query.redirect ? String(req.query.redirect) : '';
  const linkUser = req.query.linkUser ? String(req.query.linkUser) : '';
  if (requested && !oauth.isAllowedRedirect(requested)) {
    log.warn('auth', 'rejected redirect uri: ' + requested.slice(0, 120));
    return res.status(400).json({
      error: 'redirect_not_allowed',
      hint:
        `Allowed: ${env.appScheme}://…, exp://…, http://localhost…  ` +
        'Set APP_SCHEME in backend/.env to match "scheme" in mobile/app.json.',
    });
  }

  return res.json({ url: oauth.authUrl(requested, linkUser) });
}

/**
 * GET /api/auth/google/callback
 *
 * Mounted OUTSIDE the session middleware on purpose: Google's redirect carries
 * none of our cookies or headers, so the only thing we can trust is `state`.
 *
 * Ends by bouncing to the app's deep link with a ONE-TIME CODE, never the JWT
 * itself — see code.store.js for why.
 */
async function callback(req, res) {
  if (!env.googleConfigured) return googleNotConfigured(res);

  const { code, state, error } = req.query;
  const payload = state ? oauth.verifyState(String(state)) : null;
  const target = payload && oauth.isAllowedRedirect(payload.r) ? payload.r : '';

  const finish = (params) => {
    const qs = new URLSearchParams(params).toString();
    if (target) return res.redirect(`${target}${target.includes('?') ? '&' : '?'}${qs}`);
    // No app redirect (browser or curl): show something readable instead of a blank page.
    if (params.error) return res.status(400).send(`Sign-in failed: ${params.error}`);
    return res.redirect(`${env.frontendUrl}/inbox?${qs}`);
  };

  if (error) return finish({ error: String(error) });
  if (!code) return finish({ error: 'missing_code' });
  if (!payload) return finish({ error: 'bad_state' });

  try {
    const { client, tokens } = await oauth.exchangeCode(String(code));
    const profile = await oauth.fetchProfile(client);

    let user;
    if (payload && payload.u) {
      user = await User.findById(payload.u);
    }
    if (!user) {
      user = await User.findOneAndUpdate(
        { googleSub: profile.id },
        {
          $set: {
            email: profile.email,
            displayName: profile.name || '',
            avatarUrl: profile.picture || '',
            lastSeenAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }

    // A re-consent may omit refresh_token; keep the one already stored.
    const set = {
      userId: user._id,
      provider: 'gmail',
      emailAddress: profile.email,
      accessToken: encrypt(tokens.access_token),
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope ? String(tokens.scope).split(' ') : oauth.SCOPES,
      status: 'active',
      lastError: '',
    };
    if (tokens.refresh_token) set.refreshToken = encrypt(tokens.refresh_token);

    const account = await EmailAccount.findOneAndUpdate(
      { userId: user._id, emailAddress: profile.email },
      { $set: set },
      { upsert: true, new: true }
    );

    issueSession(res, user); // browser path; the app uses the code below
    log.info('auth', `connected ${profile.email}`);

    // Kick off the first sync in the background so the inbox has something to show.
    setImmediate(async () => {
      try {
        await sync.syncAccount(account._id);
        await processor.processPending(account._id, { limit: 60 });
      } catch (err) {
        log.error('auth', 'first sync failed: ' + err.message);
      }
    });

    return finish({ code: codeStore.issue(user._id) });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    log.error('auth', 'callback failed: ' + detail);
    return finish({ error: 'exchange_failed', detail });
  }
}

/**
 * POST /api/auth/exchange  { code }
 * The app calls this once, immediately, with the code from the deep link.
 */
async function exchange(req, res) {
  const code = req.body && req.body.code ? String(req.body.code) : '';
  if (!code) return res.status(400).json({ error: 'missing_code' });

  const userId = codeStore.redeem(code);
  if (!userId) {
    return res.status(401).json({
      error: 'invalid_code',
      hint: 'The code was already used or older than two minutes. Connect Gmail again.',
    });
  }

  const user = await User.findById(userId).lean();
  if (!user) return res.status(401).json({ error: 'invalid_code' });

  return res.json({
    token: signToken(user),
    user: {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
}

/** GET /api/auth/me */
async function me(req, res) {
  const accounts = await repo.allAccounts(req.userId);
  const primary = accounts[0] || null;
  return res.json({
    user: {
      id: String(req.user._id),
      email: req.user.email,
      displayName: req.user.displayName,
      avatarUrl: req.user.avatarUrl,
    },
    account: primary,
    accounts,
  });
}

/** POST /api/auth/disconnect */
async function disconnect(req, res) {
  const account = await EmailAccount.findOne({ userId: req.userId });
  if (account) {
    await oauth.revoke(account);
    await EmailAccount.updateOne(
      { _id: account._id },
      { $set: { status: 'revoked', accessToken: encrypt('revoked'), refreshToken: '' } }
    );
  }
  clearSession(res);
  return res.json({ ok: true });
}

module.exports = { authUrl, callback, exchange, me, disconnect };
