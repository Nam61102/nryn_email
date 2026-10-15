'use strict';

/**
 * Gmail's `messages.get(format=full)` payload is a nested MIME tree.
 * This turns one into the flat shape the Email model wants.
 */

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function headerMap(headers) {
  const out = {};
  (headers || []).forEach((h) => {
    out[String(h.name).toLowerCase()] = h.value;
  });
  return out;
}

/** "Sarah Jenkins <sarah@x.co>" -> { name, email } */
function parseAddress(raw) {
  if (!raw) return { name: '', email: '' };
  const m = String(raw).match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const bare = String(raw).trim().toLowerCase();
  return { name: '', email: bare };
}

function parseAddressList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((part) => parseAddress(part).email)
    .filter(Boolean);
}

/** Depth-first walk collecting the first text/plain, the first text/html, and attachments. */
function walk(part, acc) {
  if (!part) return acc;
  const mime = part.mimeType || '';
  const filename = part.filename || '';
  const body = part.body || {};

  if (filename && body.attachmentId) {
    acc.attachments.push({
      filename,
      mimeType: mime,
      sizeBytes: body.size || 0,
      attachmentId: body.attachmentId,
    });
  } else if (mime === 'text/plain' && !acc.text && body.data) {
    acc.text = decodeBase64Url(body.data);
  } else if (mime === 'text/html' && !acc.html && body.data) {
    acc.html = decodeBase64Url(body.data);
  }

  (part.parts || []).forEach((child) => walk(child, acc));
  return acc;
}

function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strips quoted reply chains before the body reaches an LLM.
 * Without this you pay for the same thread over and over on every reply.
 */
function stripQuotedChain(text) {
  if (!text) return '';
  let out = String(text);

  const markers = [
    /\n[-]{2,}\s*Original Message\s*[-]{2,}[\s\S]*$/i,
    /\nOn .{0,120}wrote:[\s\S]*$/,
    /\n_{10,}[\s\S]*$/,
    /\nFrom:\s.+\nSent:\s[\s\S]*$/i,
  ];
  markers.forEach((re) => {
    out = out.replace(re, '');
  });

  // Drop a trailing run of quoted "> " lines
  const lines = out.split('\n');
  while (lines.length && /^\s*>/.test(lines[lines.length - 1])) lines.pop();

  return lines.join('\n').trim();
}

/** Full Gmail message -> plain object ready for the Email model. */
function parseMessage(msg) {
  const payload = msg.payload || {};
  const h = headerMap(payload.headers);
  const acc = walk(payload, { text: '', html: '', attachments: [] });

  const from = parseAddress(h.from);
  const text = acc.text || (acc.html ? htmlToText(acc.html) : '');

  return {
    gmailId: msg.id,
    threadId: msg.threadId,
    messageIdHeader: h['message-id'] || '',
    fromName: from.name,
    fromEmail: from.email,
    toEmails: parseAddressList(h.to),
    ccEmails: parseAddressList(h.cc),
    subject: h.subject || '(no subject)',
    snippet: msg.snippet || '',
    bodyText: text,
    bodyHtml: acc.html || '',
    attachments: acc.attachments,
    labelIds: msg.labelIds || [],
    isUnread: (msg.labelIds || []).includes('UNREAD'),
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
  };
}

module.exports = {
  parseMessage,
  parseAddress,
  parseAddressList,
  htmlToText,
  stripQuotedChain,
  decodeBase64Url,
};
