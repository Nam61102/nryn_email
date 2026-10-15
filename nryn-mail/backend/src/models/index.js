'use strict';

/**
 * Every collection is prefixed `mail_`.
 *
 * MONGO_URI points at its own database, `nryn_email`, so nothing here can touch
 * the NRYN WhatsApp app's data. The `mail_` prefix is kept anyway: it costs
 * nothing, and it means these collections stay unambiguous if this database is
 * ever pointed somewhere shared.
 */

const User = require('./User');
const EmailAccount = require('./EmailAccount');
const Email = require('./Email');
const EmailInsight = require('./EmailInsight');
const EmailSummary = require('./EmailSummary');
const EmailActionItem = require('./EmailActionItem');
const EmailDraft = require('./EmailDraft');
const CalendarEvent = require('./CalendarEvent');

const all = [User, EmailAccount, Email, EmailInsight, EmailSummary, EmailActionItem, EmailDraft, CalendarEvent];

async function syncIndexes() {
  for (const M of all) {
    await M.syncIndexes();
  }
}

module.exports = {
  User,
  EmailAccount,
  Email,
  EmailInsight,
  EmailSummary,
  EmailActionItem,
  EmailDraft,
  CalendarEvent,
  all,
  syncIndexes,
};
