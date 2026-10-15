'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');

const COOKIE = env.sessionCookieName;

/**
 * The mobile app authenticates with `Authorization: Bearer <jwt>`, because
 * React Native has no cookie jar. The cookie path is kept so curl and a browser
 * can still hit the API during development.
 */

function signToken(user) {
  return jwt.sign({ uid: String(user._id) }, env.jwtSecret, { expiresIn: '30d' });
}

/** Sets the browser cookie AND returns the token for a native client to store. */
function issueSession(res, user) {
  const token = signToken(user);
  if (res && typeof res.cookie === 'function') {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  return token;
}

function clearSession(res) {
  if (res && typeof res.clearCookie === 'function') res.clearCookie(COOKIE, { path: '/' });
}

/** Bearer header first, cookie second. */
function readToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  if (req.cookies && req.cookies[COOKIE]) return req.cookies[COOKIE];
  return null;
}

function readUserId(req) {
  const raw = readToken(req);
  if (!raw) return null;
  try {
    return jwt.verify(raw, env.jwtSecret).uid;
  } catch (err) {
    return null;
  }
}

/**
 * Attaches req.userId. Every repository call takes that value — never an id
 * from a request body, which is how one user ends up reading another's mail.
 */
async function requireSession(req, res, next) {
  const uid = readUserId(req);
  if (!uid) return res.status(401).json({ error: 'not_authenticated' });

  const user = await User.findById(uid).lean();
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: 'not_authenticated' });
  }

  req.userId = uid;
  req.user = user;
  User.updateOne({ _id: uid }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  next();
}

module.exports = {
  signToken,
  issueSession,
  clearSession,
  requireSession,
  readUserId,
  readToken,
  COOKIE,
};
