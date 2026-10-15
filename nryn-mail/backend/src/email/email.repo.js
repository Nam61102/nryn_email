'use strict';

/**
 * Every query here takes userId from the session middleware, never from a
 * request body. That is the whole reason this file exists as one layer.
 */

const {
  Email,
  EmailAccount,
  EmailInsight,
  EmailSummary,
  EmailActionItem,
  EmailDraft,
} = require('../models');

function activeAccount(userId) {
  return EmailAccount.findOne({ userId, status: { $ne: 'revoked' } }).sort({ createdAt: 1 });
}

function accountStatus(userId) {
  return EmailAccount.findOne({ userId }, { accessToken: 0, refreshToken: 0 })
    .sort({ createdAt: 1 })
    .lean();
}

/** Joins each email with its insight, then splits into priority vs the rest. */
async function inbox(userId, { includeIgnored = false, limit = 200 } = {}) {
  const emails = await Email.find(
    { userId },
    { bodyHtml: 0, bodyText: 0 }
  )
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean();

  const ids = emails.map((e) => e._id);
  const insights = await EmailInsight.find({ emailId: { $in: ids } }).lean();
  const byEmail = new Map(insights.map((i) => [String(i.emailId), i]));

  const rows = emails.map((e) => {
    const i = byEmail.get(String(e._id)) || null;
    return {
      id: String(e._id),
      gmailId: e.gmailId,
      threadId: e.threadId,
      fromName: e.fromName || e.fromEmail,
      fromEmail: e.fromEmail,
      subject: e.subject,
      snippet: e.snippet,
      receivedAt: e.receivedAt,
      isUnread: e.isUnread,
      repliedAt: e.repliedAt,
      attachmentCount: (e.attachments || []).length,
      triaged: Boolean(i),
      priority: i ? i.priority : null,
      category: i ? i.category : null,
      insight: i ? i.insight : '',
      needsReply: i ? i.needsReply : false,
      deadlineAt: i ? i.deadlineAt : null,
    };
  });

  const priority = rows.filter((r) => r.priority === 'urgent' || r.priority === 'action_required');
  const rank = { urgent: 0, action_required: 1 };
  priority.sort((a, b) => {
    const d = rank[a.priority] - rank[b.priority];
    return d !== 0 ? d : new Date(b.receivedAt) - new Date(a.receivedAt);
  });

  const other = rows.filter(
    (r) => !priority.includes(r) && (includeIgnored || r.priority !== 'ignore')
  );

  return {
    stats: {
      total: rows.length,
      unread: rows.filter((r) => r.isUnread).length,
      needsAttention: priority.length,
      needsReply: rows.filter((r) => r.needsReply && !r.repliedAt).length,
      filtered: rows.filter((r) => r.priority === 'ignore').length,
      untriaged: rows.filter((r) => !r.triaged).length,
    },
    priority,
    other,
  };
}

/** One email, scoped to the user, with its insight and any cached extras. */
async function detail(userId, emailId) {
  const email = await Email.findOne({ _id: emailId, userId }).lean();
  if (!email) return null;

  const [insight, summary, actionItems, drafts] = await Promise.all([
    EmailInsight.findOne({ emailId: email._id }).lean(),
    EmailSummary.findOne({ emailId: email._id }).lean(),
    EmailActionItem.find({ emailId: email._id }).sort({ position: 1 }).lean(),
    EmailDraft.find({ emailId: email._id }).sort({ tone: 1, version: 1 }).lean(),
  ]);

  return { email, insight, summary, actionItems, drafts };
}

function emailDoc(userId, emailId) {
  return Email.findOne({ _id: emailId, userId });
}

function draftDoc(userId, draftId) {
  return EmailDraft.findOne({ _id: draftId, userId });
}

function actionItemDoc(userId, itemId) {
  return EmailActionItem.findOne({ _id: itemId, userId });
}

function accountDoc(userId, accountId) {
  return EmailAccount.findOne({ _id: accountId, userId, status: { $ne: 'revoked' } });
}

module.exports = {
  activeAccount,
  accountStatus,
  accountDoc,
  inbox,
  detail,
  emailDoc,
  draftDoc,
  actionItemDoc,
};
