'use strict';

const env = require('../config/env');
const log = require('../utils/logger');
const llm = require('./llm.client');
const prompt = require('./prompts/triage.prompt');
const { stripQuotedChain } = require('../gmail/gmail.parser');
const { PRIORITIES, CATEGORIES } = require('../models/EmailInsight');

/** Senders that never need an LLM call — straight to `ignore`, zero cost. */
const AUTOMATED = /(^|[._-])(no-?reply|noreply|notifications?|donotreply|mailer-daemon|bounce|postmaster|alerts?|updates?)@/i;

function isAutomated(fromEmail) {
  return AUTOMATED.test(String(fromEmail || ''));
}

function clampBody(text) {
  const stripped = stripQuotedChain(text || '');
  return stripped.slice(0, env.sync.triageBodyCharLimit);
}

function coerce(raw) {
  const priority = PRIORITIES.includes(raw.priority) ? raw.priority : 'fyi';
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'other';

  let deadlineAt = null;
  if (raw.deadline) {
    const d = new Date(raw.deadline);
    if (!Number.isNaN(d.getTime())) deadlineAt = d;
  }

  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = null;
  else confidence = Math.max(0, Math.min(1, confidence));

  const insight = String(raw.insight || '').trim().slice(0, 400);

  return {
    priority,
    category,
    insight: insight || 'No action identified.',
    needsReply: Boolean(raw.needs_reply),
    deadlineAt,
    confidence,
  };
}

/**
 * Triage one email document. Returns the fields for an EmailInsight.
 * Never throws for content reasons — a bad LLM response degrades to `fyi`.
 */
async function triageEmail(email) {
  if (isAutomated(email.fromEmail)) {
    return {
      priority: 'ignore',
      category: 'other',
      insight: 'Automated message, no action needed.',
      needsReply: false,
      deadlineAt: null,
      confidence: 1,
      modelUsed: 'rule:automated-sender',
    };
  }

  const user = prompt.buildUser({
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    subject: email.subject,
    receivedAt: email.receivedAt ? new Date(email.receivedAt).toISOString() : '',
    attachments: email.attachments,
    body: clampBody(email.bodyText || email.snippet),
  });

  const { json, modelUsed } = await llm.callJson({
    system: prompt.SYSTEM,
    user,
    maxTokens: 400,
    temperature: 0.1,
  });

  const out = coerce(json);
  out.modelUsed = modelUsed;
  log.debug('triage', `${email.gmailId} -> ${out.priority} (${modelUsed})`);
  return out;
}

module.exports = { triageEmail, isAutomated };
