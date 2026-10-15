'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const log = require('../utils/logger');

let io = null;

/**
 * Per-user rooms, never a global io.emit().
 * A global emit would hand one user's mail metadata to every open socket.
 */
function init(httpServer) {
  io = new Server(httpServer, {
    // Native clients send no Origin header, so the browser-style allowlist
    // cannot be used here. Auth is the handshake token below, not the origin.
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    try {
      // The app passes the token in handshake.auth; a browser sends the cookie.
      const token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        parseCookies(socket.handshake.headers.cookie || '')[env.sessionCookieName];
      if (!token) return next(new Error('not_authenticated'));
      const { uid } = jwt.verify(token, env.jwtSecret);
      socket.data.userId = uid;
      return next();
    } catch (err) {
      return next(new Error('not_authenticated'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.userId);
    log.debug('socket', 'connected user ' + socket.data.userId);
    socket.on('disconnect', () => log.debug('socket', 'disconnected ' + socket.data.userId));
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(String(userId)).emit(event, payload);
}

function parseCookies(header) {
  const out = {};
  String(header)
    .split(';')
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
    });
  return out;
}

module.exports = { init, emitToUser, get: () => io };
