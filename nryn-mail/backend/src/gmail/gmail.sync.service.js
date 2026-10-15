'use strict';

const env = require('../config/env');
const log = require('../utils/logger');
const gmail = require('./gmail.client');
const { parseMessage } = require('./gmail.parser');
const { Email, EmailAccount } = require('../models');

const LOCK_STALE_MS = 10 * 60 * 1000; // a lock older than this is assumed crashed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Claims the sync lock for an account. Returns false if another run holds it,
 * so a slow bootstrap can never overlap with the next cron tick.
 */
async function acquireLock(accountId) {
  const cutoff = new Date(Date.now() - LOCK_STALE_MS);
  const res = await EmailAccount.updateOne(
    {
      _id: accountId,
      $or: [{ syncLockedAt: null }, { syncLockedAt: { $lt: cutoff } }],
    },
    { $set: { syncLockedAt: new Date() } }
  );
  return res.modifiedCount === 1;
}

function releaseLock(accountId) {
  return EmailAccount.updateOne({ _id: accountId }, { $set: { syncLockedAt: null } });
}

/** Upsert one parsed message. Returns true if it was newly inserted. */
async function upsertMessage(account, msg) {
  const parsed = parseMessage(msg);
  const res = await Email.updateOne(
    { accountId: account._id, gmailId: parsed.gmailId },
    {
      $set: {
        threadId: parsed.threadId,
        messageIdHeader: parsed.messageIdHeader,
        fromName: parsed.fromName,
        fromEmail: parsed.fromEmail,
        toEmails: parsed.toEmails,
        ccEmails: parsed.ccEmails,
        subject: parsed.subject,
        snippet: parsed.snippet,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        attachments: parsed.attachments,
        labelIds: parsed.labelIds,
        isUnread: parsed.isUnread,
        receivedAt: parsed.receivedAt,
      },
      $setOnInsert: {
        userId: account.userId,
        accountId: account._id,
        gmailId: parsed.gmailId,
        processedAt: null,
      },
    },
    { upsert: true }
  );
  return res.upsertedCount === 1;
}

/**
 * Fetch message bodies in small batches. The Gmail per-user rate limit (250
 * units/sec, and messages.get costs 5) is what bites during bootstrap — not the
 * daily project quota.
 */
async function fetchAndStore(account, ids) {
  const size = env.sync.triageBatchSize;
  let inserted = 0;

  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size);
    const results = await Promise.allSettled(slice.map((id) => gmail.getMessage(account, id)));

    for (const r of results) {
      if (r.status !== 'fulfilled') {
        log.warn('sync', 'messages.get failed: ' + (r.reason && r.reason.message));
        continue;
      }
      try {
        if (await upsertMessage(account, r.value)) inserted += 1;
      } catch (err) {
        log.warn('sync', 'upsert failed for ' + r.value.id + ': ' + err.message);
      }
    }
    if (i + size < ids.length) await sleep(800);
  }
  return inserted;
}

/** First connect, or recovery when the history cursor has expired. */
async function bootstrapSync(account) {
  const q = `in:inbox newer_than:${env.sync.bootstrapDays}d`;
  const cap = env.sync.bootstrapMaxEmails;
  const ids = [];
  let pageToken;

  do {
    const page = await gmail.listMessages(account, { q, maxResults: 100, pageToken });
    (page.messages || []).forEach((m) => {
      if (ids.length < cap) ids.push(m.id);
    });
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < cap);

  log.info('sync', `bootstrap: ${ids.length} messages for ${account.emailAddress}`);
  const inserted = await fetchAndStore(account, ids);

  const profile = await gmail.getProfile(account);
  await EmailAccount.updateOne(
    { _id: account._id },
    { $set: { historyId: String(profile.historyId), lastSyncedAt: new Date(), lastError: '' } }
  );

  return { mode: 'bootstrap', seen: ids.length, inserted };
}

/** Every cron tick: only what changed since the stored history id. */
async function incrementalSync(account) {
  const ids = new Set();
  let pageToken;

  try {
    do {
      const page = await gmail.listHistory(account, account.historyId, pageToken);
      (page.history || []).forEach((h) => {
        (h.messagesAdded || []).forEach((m) => {
          const labels = (m.message && m.message.labelIds) || [];
          if (labels.includes('INBOX')) ids.add(m.message.id);
        });
        (h.labelsAdded || []).forEach((m) => m.message && ids.add(m.message.id));
        (h.labelsRemoved || []).forEach((m) => m.message && ids.add(m.message.id));
      });
      if (page.historyId) account.historyId = String(page.historyId);
      pageToken = page.nextPageToken;
    } while (pageToken);
  } catch (err) {
    const code = err.code || (err.response && err.response.status);
    if (code === 404) {
      log.warn('sync', 'history id expired — falling back to bootstrap');
      return bootstrapSync(account);
    }
    throw err;
  }

  const list = Array.from(ids);
  const inserted = list.length ? await fetchAndStore(account, list) : 0;

  await EmailAccount.updateOne(
    { _id: account._id },
    { $set: { historyId: account.historyId, lastSyncedAt: new Date(), lastError: '' } }
  );

  return { mode: 'incremental', seen: list.length, inserted };
}

/** The one entry point. Picks bootstrap vs incremental and holds the lock. */
async function syncAccount(accountId) {
  const account = await EmailAccount.findById(accountId);
  if (!account) return { skipped: 'account_not_found' };
  if (account.status !== 'active') return { skipped: account.status };

  if (!(await acquireLock(account._id))) {
    log.debug('sync', 'another sync already running for ' + account.emailAddress);
    return { skipped: 'locked' };
  }

  try {
    const result = account.historyId
      ? await incrementalSync(account)
      : await bootstrapSync(account);
    log.info(
      'sync',
      `${account.emailAddress} ${result.mode}: ${result.seen} seen, ${result.inserted} new`
    );
    return result;
  } catch (err) {
    log.error('sync', `${account.emailAddress} failed: ${err.message}`);
    await EmailAccount.updateOne(
      { _id: account._id },
      { $set: { lastError: String(err.message).slice(0, 300) } }
    );
    throw err;
  } finally {
    await releaseLock(account._id);
  }
}

module.exports = { syncAccount, bootstrapSync, incrementalSync };
