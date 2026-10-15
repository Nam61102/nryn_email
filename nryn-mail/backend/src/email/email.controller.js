'use strict';

const log = require('../utils/logger');
const repo = require('./email.repo');
const sync = require('../gmail/gmail.sync.service');
const processor = require('./email.processor');
const summaryService = require('../ai/summary.service');
const replyService = require('../ai/reply.service');
const sendService = require('./send.service');
const llm = require('../ai/llm.client');
const { emitToUser } = require('../realtime/socket');
const { TONES } = require('../models/EmailDraft');

function noLlm(res) {
  return res.status(503).json({
    error: 'no_llm_provider',
    hint: 'Set OPENROUTER_API_KEY (or GROQ_API_KEY / OPENAI_API_KEY) in backend/.env and restart.',
  });
}

function notFound(res) {
  return res.status(404).json({ error: 'not_found' });
}

/** GET /api/email/inbox */
async function getInbox(req, res, next) {
  try {
    const includeIgnored = req.query.includeIgnored === '1';
    const accountId = req.query.accountId ? String(req.query.accountId) : null;
    const data = await repo.inbox(req.userId, { includeIgnored, accountId });

    const accounts = data.accounts || [];
    const currentAccount = accounts.find((a) => a.id === data.selectedAccountId) || accounts[0] || null;

    // Trigger quick background sync if last sync was more than 15 seconds ago
    if (currentAccount && currentAccount.status === 'active' && (!currentAccount.lastSyncedAt || Date.now() - new Date(currentAccount.lastSyncedAt).getTime() > 15000)) {
      setImmediate(async () => {
        try {
          const syncResult = await sync.syncAccount(currentAccount.id);
          if (syncResult && syncResult.inserted > 0) {
            await processor.processPending(currentAccount.id, { limit: 20 });
            emitToUser(req.userId, 'email:synced', { count: syncResult.inserted, accountId: currentAccount.id });
          }
        } catch (e) {
          log.debug('inbox', 'background auto-sync tick: ' + e.message);
        }
      });
    }

    return res.json({
      ...data,
      account: currentAccount,
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/email/sync — the manual refresh button. */
async function postSync(req, res, next) {
  try {
    const requestedId = req.query.accountId || (req.body && req.body.accountId);
    let account;
    if (requestedId) {
      account = await repo.accountDoc(req.userId, requestedId);
    }
    if (!account) {
      account = await repo.activeAccount(req.userId);
    }
    if (!account) return res.status(400).json({ error: 'no_connected_account' });
    if (account.status !== 'active') {
      return res.status(409).json({ error: account.status, hint: 'Reconnect Gmail to continue.' });
    }

    const result = await sync.syncAccount(account._id);
    const triage = await processor.processPending(account._id, { limit: 40 });

    emitToUser(req.userId, 'email:synced', { count: result.inserted || 0, accountId: String(account._id) });
    return res.json({ sync: result, triage, accountId: String(account._id) });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/email/:id */
async function getEmail(req, res, next) {
  try {
    const data = await repo.detail(req.userId, req.params.id);
    if (!data) return notFound(res);

    const { email, insight, summary, actionItems, drafts } = data;
    return res.json({
      email: {
        id: String(email._id),
        gmailId: email.gmailId,
        threadId: email.threadId,
        fromName: email.fromName || email.fromEmail,
        fromEmail: email.fromEmail,
        toEmails: email.toEmails,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        attachments: email.attachments,
        receivedAt: email.receivedAt,
        isUnread: email.isUnread,
        repliedAt: email.repliedAt,
      },
      insight: insight || null,
      summary: summary || null,
      actionItems: actionItems || [],
      drafts: (drafts || []).map(shapeDraft),
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/email/:id/summarize — cached; a second tap does not re-bill. */
async function postSummarize(req, res, next) {
  try {
    if (!llm.isConfigured()) return noLlm(res);
    const email = await repo.emailDoc(req.userId, req.params.id);
    if (!email) return notFound(res);

    const force = req.query.force === '1';
    const { summary, actionItems, cached } = await summaryService.getOrCreateSummary(email, { force });

    return res.json({
      cached,
      keyPoints: summary.keyPoints,
      importantNote: summary.importantNote,
      generatedAt: summary.generatedAt,
      actionItems: actionItems.map((i) => ({
        id: String(i._id),
        description: i.description,
        dueDate: i.dueDate,
        assignee: i.assignee,
        isChecked: i.isChecked,
      })),
    });
  } catch (err) {
    if (err.code === 'NO_LLM_PROVIDER') return noLlm(res);
    return next(err);
  }
}

/** PATCH /api/email/action-items/:id */
async function patchActionItem(req, res, next) {
  try {
    const item = await repo.actionItemDoc(req.userId, req.params.id);
    if (!item) return notFound(res);
    item.isChecked =
      typeof req.body.isChecked === 'boolean' ? req.body.isChecked : !item.isChecked;
    await item.save();
    return res.json({ id: String(item._id), isChecked: item.isChecked });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/email/:id/draft  body: { tone } — regenerate is the same call again. */
async function postDraft(req, res, next) {
  try {
    if (!llm.isConfigured()) return noLlm(res);
    const email = await repo.emailDoc(req.userId, req.params.id);
    if (!email) return notFound(res);

    const tone = TONES.includes(req.body.tone) ? req.body.tone : 'professional';
    const draft = await replyService.generateDraft(email, tone, req.user);
    const all = await replyService.listDrafts(email._id);

    return res.json({
      draft: shapeDraft(draft),
      versionsForTone: all.filter((d) => d.tone === tone).length,
    });
  } catch (err) {
    if (err.code === 'NO_LLM_PROVIDER') return noLlm(res);
    return next(err);
  }
}

/** GET /api/email/:id/drafts — powers the "Version 2 of 3" stepper. */
async function getDrafts(req, res, next) {
  try {
    const email = await repo.emailDoc(req.userId, req.params.id);
    if (!email) return notFound(res);
    const all = await replyService.listDrafts(email._id);
    return res.json({ drafts: all.map(shapeDraft) });
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/email/draft/:id — save the user's manual edits. */
async function patchDraft(req, res, next) {
  try {
    const draft = await repo.draftDoc(req.userId, req.params.id);
    if (!draft) return notFound(res);
    if (draft.status === 'sent') return res.status(409).json({ error: 'already_sent' });

    if (typeof req.body.body === 'string') {
      draft.body = req.body.body;
      draft.isUserEdited = true;
    }
    await draft.save();
    return res.json({ draft: shapeDraft(draft.toObject()) });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/email/draft/:id/send — the only call needing the gmail.send scope. */
async function postSend(req, res, next) {
  try {
    const draft = await repo.draftDoc(req.userId, req.params.id);
    if (!draft) return notFound(res);
    if (draft.status === 'sent') return res.status(409).json({ error: 'already_sent' });

    const email = await repo.emailDoc(req.userId, draft.emailId);
    if (!email) return notFound(res);

    const account =
      (email.accountId && (await repo.accountDoc(req.userId, email.accountId))) ||
      (await repo.activeAccount(req.userId));
    if (!account) return res.status(400).json({ error: 'no_connected_account' });
    if (!(account.scopes || []).some((s) => s.includes('gmail.send'))) {
      return res.status(403).json({
        error: 'missing_send_scope',
        hint: 'Disconnect and reconnect Gmail so the gmail.send scope is granted.',
      });
    }

    const sent = await sendService.sendDraft({ draft, email, account, user: req.user });
    emitToUser(req.userId, 'email:reply_sent', { emailId: String(email._id) });

    return res.json({ ok: true, gmailId: sent.id, threadId: sent.threadId });
  } catch (err) {
    log.error('send', 'failed: ' + err.message);
    const msg = String(err.message || '');
    if (
      msg.includes('Quota exceeded') ||
      msg.includes('rateLimitExceeded') ||
      msg.includes('userRateLimitExceeded') ||
      err.status === 429 ||
      err.code === 429
    ) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Gmail rate limit reached. Please wait a few seconds and try again.',
        hint: 'Google Cloud limits per-minute query cost on unverified apps.',
      });
    }
    return next(err);
  }
}

function shapeDraft(d) {
  return {
    id: String(d._id),
    emailId: String(d.emailId),
    tone: d.tone,
    body: d.body,
    version: d.version,
    isUserEdited: d.isUserEdited,
    status: d.status,
    createdAt: d.createdAt,
  };
}

module.exports = {
  getInbox,
  postSync,
  getEmail,
  postSummarize,
  patchActionItem,
  postDraft,
  getDrafts,
  patchDraft,
  postSend,
};
