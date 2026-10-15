'use strict';

const llm = require('./llm.client');
const prompt = require('./prompts/summary.prompt');
const { stripQuotedChain } = require('../gmail/gmail.parser');
const { EmailSummary, EmailActionItem } = require('../models');

/**
 * On-demand only — runs when the user taps "Summarize with NRYN", never on sync.
 * The result is cached, so a second tap costs nothing.
 */
async function getOrCreateSummary(email, { force = false } = {}) {
  if (!force) {
    const cached = await EmailSummary.findOne({ emailId: email._id }).lean();
    if (cached) {
      const items = await EmailActionItem.find({ emailId: email._id })
        .sort({ position: 1 })
        .lean();
      return { summary: cached, actionItems: items, cached: true };
    }
  }

  const user = prompt.buildUser({
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    subject: email.subject,
    receivedAt: email.receivedAt ? new Date(email.receivedAt).toISOString() : '',
    body: stripQuotedChain(email.bodyText || email.snippet).slice(0, 6000),
  });

  const { json, modelUsed } = await llm.callJson({
    system: prompt.SYSTEM,
    user,
    maxTokens: 900,
    temperature: 0.2,
  });

  const keyPoints = Array.isArray(json.key_points)
    ? json.key_points.map((s) => String(s).trim()).filter(Boolean).slice(0, 6)
    : [];
  const importantNote = String(json.important_note || '').trim();

  const summary = await EmailSummary.findOneAndUpdate(
    { emailId: email._id },
    {
      $set: {
        userId: email.userId,
        keyPoints,
        importantNote,
        modelUsed,
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  // Replace the action items wholesale; checkbox state for a regenerated
  // summary is meaningless because the items themselves changed.
  await EmailActionItem.deleteMany({ emailId: email._id });

  const rawItems = Array.isArray(json.action_items) ? json.action_items.slice(0, 5) : [];
  const docs = rawItems
    .map((it, i) => ({
      emailId: email._id,
      userId: email.userId,
      description: String((it && it.description) || '').trim(),
      dueDate: String((it && it.due_date) || '').trim(),
      assignee: String((it && it.assignee) || '').trim(),
      isChecked: false,
      position: i,
    }))
    .filter((d) => d.description);

  const actionItems = docs.length ? await EmailActionItem.insertMany(docs) : [];

  return {
    summary,
    actionItems: actionItems.map((d) => (d.toObject ? d.toObject() : d)),
    cached: false,
  };
}

module.exports = { getOrCreateSummary };
