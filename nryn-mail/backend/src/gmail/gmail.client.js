'use strict';

const { google } = require('googleapis');
const { withFreshToken } = require('../auth/google.oauth');

const api = (client) => google.gmail({ version: 'v1', auth: client });

function listMessages(account, { q, maxResults = 100, pageToken }) {
  return withFreshToken(account, async (client) => {
    const { data } = await api(client).users.messages.list({
      userId: 'me',
      q,
      maxResults,
      pageToken,
    });
    return data; // { messages: [{id, threadId}], nextPageToken, resultSizeEstimate }
  });
}

function getMessage(account, id) {
  return withFreshToken(account, async (client) => {
    const { data } = await api(client).users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });
    return data;
  });
}

function getProfile(account) {
  return withFreshToken(account, async (client) => {
    const { data } = await api(client).users.getProfile({ userId: 'me' });
    return data; // { emailAddress, messagesTotal, threadsTotal, historyId }
  });
}

/**
 * Incremental sync. Throws an error with .code === 404 when the history id has
 * expired (roughly a week), which the sync service treats as "re-bootstrap".
 */
function listHistory(account, startHistoryId, pageToken) {
  return withFreshToken(account, async (client) => {
    const { data } = await api(client).users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
      maxResults: 500,
      pageToken,
    });
    return data;
  });
}

/**
 * Send a reply. Both pieces matter:
 *   - In-Reply-To / References headers, so the recipient's client threads it
 *   - threadId in the request body, so it threads inside Gmail
 * Miss either and the reply shows up as a brand-new conversation.
 */
function sendRaw(account, { raw, threadId }) {
  return withFreshToken(account, async (client) => {
    const { data } = await api(client).users.messages.send({
      userId: 'me',
      requestBody: threadId ? { raw, threadId } : { raw },
    });
    return data; // { id, threadId, labelIds }
  });
}

module.exports = { listMessages, getMessage, getProfile, listHistory, sendRaw };
