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

function allAccounts(userId) {
  return EmailAccount.find({ userId, status: { $ne: 'revoked' } }, { accessToken: 0, refreshToken: 0 })
    .sort({ createdAt: 1 })
    .lean();
}

function checkIsMeeting(e) {
  const hasIcs = (e.attachments || []).some((a) =>
    (a.filename && a.filename.toLowerCase().endsWith('.ics')) ||
    (a.mimeType && a.mimeType.toLowerCase().includes('calendar'))
  );
  if (hasIcs) return true;

  const text = `${e.subject || ''} ${e.snippet || ''} ${e.fromEmail || ''}`.toLowerCase();
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

/** Joins each email with its insight, then splits into priority vs the rest. */
async function inbox(userId, { includeIgnored = false, limit = 200, accountId = null } = {}) {
  const accounts = await allAccounts(userId);

  // If specific accountId requested, filter by it; otherwise default to first account
  let targetAccountId = accountId;
  if (!targetAccountId && accounts.length > 0) {
    targetAccountId = String(accounts[0]._id);
  }

  const query = { userId };
  if (targetAccountId && targetAccountId !== 'all') {
    query.accountId = targetAccountId;
  }

  const emails = await Email.find(
    query,
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
    let priority = i ? i.priority : null;
    let category = i ? i.category : null;
    let insight = i ? i.insight : '';
    let needsReply = i ? i.needsReply : false;

    const isMeet = checkIsMeeting(e) || category === 'meeting';
    if (isMeet) {
      category = 'meeting';
      if (!priority || priority === 'ignore' || priority === 'fyi') {
        priority = 'action_required';
      }
      if (!insight) {
        const cleanSubj = (e.subject || 'Meeting').replace(/^(Invitation:\s*|Updated invitation:\s*)/i, '').trim();
        insight = `Meeting invitation: "${cleanSubj}". Please review or attend.`;
      }
      needsReply = true;
    }

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
      triaged: Boolean(i) || isMeet,
      priority,
      category,
      insight,
      needsReply,
      deadlineAt: i ? i.deadlineAt : null,
    };
  });

  const priority = rows.filter((r) => r.priority === 'urgent' || r.priority === 'action_required' || r.category === 'meeting');
  const rank = { urgent: 0, action_required: 1, fyi: 2, ignore: 3 };
  priority.sort((a, b) => {
    const d = (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
    return d !== 0 ? d : new Date(b.receivedAt) - new Date(a.receivedAt);
  });

  const other = rows.filter(
    (r) => !priority.includes(r) && (includeIgnored || r.priority !== 'ignore')
  );

  return {
    accounts: accounts.map((a) => ({
      id: String(a._id),
      emailAddress: a.emailAddress,
      status: a.status,
      lastSyncedAt: a.lastSyncedAt,
    })),
    selectedAccountId: targetAccountId,
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
  allAccounts,
  accountDoc,
  inbox,
  detail,
  emailDoc,
  draftDoc,
  actionItemDoc,
};
