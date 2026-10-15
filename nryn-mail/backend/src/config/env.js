'use strict';

/**
 * Reads and validates every environment variable at boot.
 *
 * Two tiers on purpose:
 *   HARD  — the process cannot run at all without these. Crash loudly.
 *   SOFT  — a feature is unavailable without them. Boot, warn once, and let the
 *           relevant route answer 503 with the missing key's name, so you can
 *           start the server before you've finished the Google Console steps.
 */

require('dotenv').config();

const HARD = ['MONGO_URI', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'];

const missingHard = HARD.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missingHard.length) {
  console.error('\n[env] FATAL — missing required environment variables:');
  missingHard.forEach((k) => console.error(`       • ${k}`));
  console.error('\n       Copy backend/.env.example to backend/.env and fill them in.');
  console.error('       Generate secrets with:  openssl rand -hex 32\n');
  process.exit(1);
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY)) {
  console.error('\n[env] FATAL — TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters');
  console.error('       (32 bytes for AES-256-GCM). Generate one with: openssl rand -hex 32\n');
  process.exit(1);
}

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const env = {
  port: int(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  frontendUrl: process.env.FRONTEND_URL || '',
  // Must match "scheme" in mobile/app.json — it's how the built app is reopened
  // after Google consent.
  appScheme: process.env.APP_SCHEME || 'nrynmail',

  mongoUri: process.env.MONGO_URI,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      (process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/google/callback`
        : (process.env.NODE_ENV === 'production' || process.env.RENDER
            ? 'https://nryn-email.onrender.com/api/auth/google/callback'
            : 'http://localhost:4100/api/auth/google/callback')),
  },

  jwtSecret: process.env.JWT_SECRET,
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'nryn_mail_sid',

  ai: {
    openrouterKey: process.env.OPENROUTER_API_KEY || '',
    openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku',
    groqKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    openaiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  sync: {
    cron: process.env.SYNC_CRON || '*/3 * * * *',
    bootstrapDays: int(process.env.BOOTSTRAP_DAYS, 30),
    bootstrapMaxEmails: int(process.env.BOOTSTRAP_MAX_EMAILS, 300),
    triageBodyCharLimit: int(process.env.TRIAGE_BODY_CHAR_LIMIT, 1500),
    triageBatchSize: int(process.env.TRIAGE_BATCH_SIZE, 10),
  },
};

/** Which soft requirements are missing — used by routes to answer 503 helpfully. */
env.missingGoogle = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((k) => !process.env[k]);
env.hasAnyLlmKey = Boolean(env.ai.openrouterKey || env.ai.groqKey || env.ai.openaiKey);
env.googleConfigured = env.missingGoogle.length === 0;

env.warnOnce = function warnOnce() {
  if (!env.googleConfigured) {
    console.warn('[env] Google OAuth is not configured yet — missing: ' + env.missingGoogle.join(', '));
    console.warn('      "Connect Gmail" will answer 503 until you fill these in backend/.env');
  }
  if (!env.hasAnyLlmKey) {
    console.warn('[env] No LLM key set (OPENROUTER_API_KEY / GROQ_API_KEY / OPENAI_API_KEY).');
    console.warn('      Sync and the UI work; triage, summarize and draft will answer 503.');
  }
};

module.exports = env;
