'use strict';

/**
 * NRYN Mail — standalone AI email agent.
 *
 * Nothing in this process touches the NRYN WhatsApp app. Separate port,
 * separate database collections (all prefixed `mail_`), separate .env.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./src/config/env');
const log = require('./src/utils/logger');
const db = require('./src/db/connect');
const socket = require('./src/realtime/socket');
const syncJob = require('./src/jobs/sync.job');

const authRoutes = require('./src/routes/auth.routes');
const emailRoutes = require('./src/routes/email.routes');
const calendarRoutes = require('./src/routes/calendar.routes');

const app = express();

app.set('trust proxy', 1);
// The client is a native app, which sends no Origin header and authenticates
// with a Bearer token rather than a cookie — so CORS is not the security
// boundary here, the session middleware is. Reflecting the origin keeps a
// browser or curl usable for debugging without weakening anything.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    ok: true,
    service: 'nryn-mail',
    env: env.nodeEnv,
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    googleConfigured: env.googleConfigured,
    llmConfigured: env.hasAnyLlmKey,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/calendar', calendarRoutes);

app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error('http', `${req.method} ${req.path} -> ${err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'server_error',
    message: env.isProd ? undefined : err.message,
  });
});

const server = http.createServer(app);

async function main() {
  env.warnOnce();
  socket.init(server);

  server.listen(env.port, () => {
    log.info('server', `NRYN Mail API listening on port ${env.port}`);
    log.info('server', `mobile deep-link scheme: ${env.appScheme}:// (must match mobile/app.json)`);
    log.info(
      'server',
      'the phone reaches this at http://<your-LAN-IP>:' + env.port + ' — set EXPO_PUBLIC_API_URL in mobile/.env'
    );
  });

  try {
    await db.connect();
    syncJob.start();
  } catch (err) {
    log.error('server', 'Initial MongoDB connection failed: ' + err.message);
  }
}

// A rejection that reaches here would otherwise kill the process silently.
process.on('unhandledRejection', (reason) => {
  log.error('process', 'unhandled rejection: ' + (reason && reason.message ? reason.message : reason));
});

async function shutdown(signal) {
  log.info('server', `${signal} — shutting down`);
  syncJob.stop();
  server.close();
  try {
    await db.disconnect();
  } catch (err) {
    /* ignore */
  }
  process.exit(0);
}
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));

main().catch((err) => {
  log.error('server', 'failed to start: ' + err.message);
  process.exit(1);
});
