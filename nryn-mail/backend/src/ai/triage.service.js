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

function isMeeting(email) {
  if (!email) return false;
  const hasIcs = (email.attachments || []).some((a) =>
    (a.filename && a.filename.toLowerCase().endsWith('.ics')) ||
    (a.mimeType && a.mimeType.toLowerCase().includes('calendar'))
  );
  if (hasIcs) return true;

  const text = `${email.subject || ''} ${email.snippet || ''} ${email.fromEmail || ''}`.toLowerCase();
  const meetingKeywords = [
    'meeting',
    'meet.google',
    'google meet',
    'zoom.us',
    'zoom meeting',
    'teams meeting',
    'microsoft teams',
    'invitation:',
    'updated invitation:',
    'cancelled invitation:',
    'calendar invite',
    'calendar-notification',
    'discussion:',
    'sync call',
    '1:1',
    'interview',
    'appointment',
    'scheduled a meeting',
    'huddle',
    'standup',
  ];
  return meetingKeywords.some((kw) => text.includes(kw));
}

/**
 * Triage one email document. Returns the fields for an EmailInsight.
 * Never throws for content reasons — a bad LLM response degrades to `fyi`.
 */
async function triageEmail(email) {
  const meeting = isMeeting(email);

  if (meeting) {
    const subjectClean = (email.subject || 'Meeting')
      .replace(/^(Invitation:\s*|Updated invitation:\s*)/i, '')
      .trim();
    // Automated calendar emails (e.g. from calendar-notification@google.com)
    if (isAutomated(email.fromEmail)) {
      return {
        priority: 'action_required',
        category: 'meeting',
        insight: `Meeting invitation: "${subjectClean}". Please review or attend.`,
        needsReply: true,
        deadlineAt: null,
        confidence: 1,
        modelUsed: 'rule:meeting-invite',
      };
    }
  } else if (isAutomated(email.fromEmail)) {
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
  if (meeting || out.category === 'meeting') {
    out.category = 'meeting';
    if (out.priority === 'ignore' || out.priority === 'fyi') {
      out.priority = 'action_required';
    }
    if (!out.insight || out.insight === 'No action identified.') {
      out.insight = `Meeting request: "${email.subject || 'Meeting'}".`;
    }
  }

  out.modelUsed = modelUsed;
  log.debug('triage', `${email.gmailId} -> ${out.priority} (${modelUsed})`);
  return out;
}

module.exports = { triageEmail, isAutomated, isMeeting };

