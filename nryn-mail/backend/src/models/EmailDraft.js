'use strict';

const { Schema, model } = require('mongoose');

const TONES = ['professional', 'friendly', 'concise'];

/**
 * One document per generated version. Regenerate inserts a new version;
 * it never overwrites, so "Version 2 of 3" is just a count.
 */
const EmailDraftSchema = new Schema(
  {
    emailId: { type: Schema.Types.ObjectId, ref: 'MailEmail', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },

    tone: { type: String, enum: TONES, required: true },
    body: { type: String, required: true },
    version: { type: Number, required: true },
    isUserEdited: { type: Boolean, default: false },

    status: { type: String, enum: ['draft', 'sent', 'discarded'], default: 'draft', index: true },

    // Captured at generation time so Send can thread correctly even if the
    // source email document changes later.
    threadId: { type: String, default: '' },
    inReplyToMessageId: { type: String, default: '' },

    sentGmailId: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    modelUsed: { type: String, default: '' },
  },
  { timestamps: true, collection: 'mail_email_drafts' }
);

EmailDraftSchema.index({ emailId: 1, tone: 1, version: -1 });

module.exports = model('MailEmailDraft', EmailDraftSchema);
module.exports.TONES = TONES;
