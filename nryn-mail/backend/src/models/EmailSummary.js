'use strict';

const { Schema, model } = require('mongoose');

/**
 * Written only when the user taps "Summarize with NRYN" — never on sync.
 * Cached: a second tap returns this document instead of re-billing the LLM.
 */
const EmailSummarySchema = new Schema(
  {
    emailId: { type: Schema.Types.ObjectId, ref: 'MailEmail', required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },

    keyPoints: { type: [String], default: [] },
    importantNote: { type: String, default: '' },
    modelUsed: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'mail_email_summaries' }
);

module.exports = model('MailEmailSummary', EmailSummarySchema);
