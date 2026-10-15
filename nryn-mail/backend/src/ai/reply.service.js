'use strict';

const llm = require('./llm.client');
const prompt = require('./prompts/reply.prompt');
const { stripQuotedChain } = require('../gmail/gmail.parser');
const { EmailDraft, EmailInsight } = require('../models');
const { TONES } = require('../models/EmailDraft');

/**
 * Generate a draft for one tone and store it as a NEW version.
 * Regenerate is just this function called again — nothing is ever overwritten,
 * so "Version 2 of 3" is a plain count.
 */
async function generateDraft(email, tone, user) {
  const safeTone = TONES.includes(tone) ? tone : 'professional';
  const insight = await EmailInsight.findOne({ emailId: email._id }).lean();

  const userMsg = prompt.buildUser({
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    subject: email.subject,
    body: stripQuotedChain(email.bodyText || email.snippet).slice(0, 6000),
    tone: safeTone,
    insight: insight ? insight.insight : '',
    deadline: insight && insight.deadlineAt ? new Date(insight.deadlineAt).toDateString() : '',
    userName: (user && (user.displayName || user.email)) || '',
  });

  const { text, modelUsed } = await llm.callText({
    system: prompt.SYSTEM,
    user: userMsg,
    maxTokens: 600,
    temperature: safeTone === 'concise' ? 0.4 : 0.65,
  });

  const last = await EmailDraft.findOne({ emailId: email._id, tone: safeTone })
    .sort({ version: -1 })
    .lean();
  const version = (last ? last.version : 0) + 1;

  const draft = await EmailDraft.create({
    emailId: email._id,
    userId: email.userId,
    tone: safeTone,
    body: cleanup(text),
    version,
    threadId: email.threadId,
    inReplyToMessageId: email.messageIdHeader,
    modelUsed,
  });

  return draft.toObject();
}

/** Strip anything the model wrapped around the body despite being told not to. */
function cleanup(text) {
  return String(text)
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^\s*(here(?:'s| is) (?:a |the )?draft[^\n]*:?)\s*\n+/i, '')
    .replace(/^subject:.*\n+/i, '')
    .trim();
}

/** All versions for one email, newest first per tone — powers the version stepper. */
async function listDrafts(emailId) {
  return EmailDraft.find({ emailId }).sort({ tone: 1, version: 1 }).lean();
}

module.exports = { generateDraft, listDrafts, TONES };
