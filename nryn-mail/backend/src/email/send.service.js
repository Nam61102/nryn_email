'use strict';

const gmail = require('../gmail/gmail.client');
const log = require('../utils/logger');
const { EmailDraft, Email } = require('../models');

/** RFC 2047 encoded-word, so a non-ASCII subject survives the header. */
function encodeHeader(value) {
  const s = String(value || '');
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

function replySubject(original) {
  const s = String(original || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build the raw RFC822 message.
 *
 * In-Reply-To and References make the recipient's client thread it.
 * The threadId passed separately to messages.send makes GMAIL thread it.
 * You need both — miss either and the reply appears as a new conversation.
 */
function buildRaw({ toEmail, toName, fromEmail, fromName, subject, body, inReplyTo }) {
  const to = toName ? `${encodeHeader(toName)} <${toEmail}>` : toEmail;
  const from = fromName ? `${encodeHeader(fromName)} <${fromEmail}>` : fromEmail;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(replySubject(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  return `${headers.join('\r\n')}\r\n\r\n${String(body).replace(/\n/g, '\r\n')}`;
}

/**
 * Send one draft. Requires the gmail.send scope — the only call in the app
 * that does. Everything up to a fully written draft works on gmail.readonly.
 */
async function sendDraft({ draft, email, account, user }) {
  const raw = toBase64Url(
    buildRaw({
      toEmail: email.fromEmail,
      toName: email.fromName,
      fromEmail: account.emailAddress,
      fromName: user.displayName || '',
      subject: email.subject,
      body: draft.body,
      inReplyTo: draft.inReplyToMessageId || email.messageIdHeader,
    })
  );

  let sent;
  let attempts = 0;
  while (attempts < 3) {
    try {
      sent = await gmail.sendRaw(account, {
        raw,
        threadId: draft.threadId || email.threadId,
      });
      break;
    } catch (err) {
      attempts++;
      const isQuotaOrRateLimit =
        err.status === 429 ||
        err.code === 429 ||
        err.status === 403 ||
        err.code === 403 ||
        String(err.message).toLowerCase().includes('quota') ||
        String(err.message).toLowerCase().includes('rate');
      if (isQuotaOrRateLimit && attempts < 3) {
        log.warn('send', `rate-limited by Gmail API, retrying in ${attempts * 1500}ms...`);
        await new Promise((r) => setTimeout(r, attempts * 1500));
      } else {
        throw err;
      }
    }
  }

  await EmailDraft.updateOne(
    { _id: draft._id },
    { $set: { status: 'sent', sentGmailId: sent.id, sentAt: new Date() } }
  );
  await Email.updateOne({ _id: email._id }, { $set: { repliedAt: new Date() } });

  log.info('send', `replied to ${email.gmailId} in thread ${sent.threadId}`);
  return sent;
}

module.exports = { sendDraft, buildRaw, replySubject, toBase64Url };
