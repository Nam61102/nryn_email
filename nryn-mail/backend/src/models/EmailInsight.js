'use strict';

const { Schema, model } = require('mongoose');

const PRIORITIES = ['urgent', 'action_required', 'fyi', 'ignore'];
const CATEGORIES = [
  'meeting',
  'approval',
  'document',
  'invoice',
  'newsletter',
  'personal',
  'other',
];

/**
 * The automatic triage pass — exactly one per email.
 *
 * `insight` is the field that makes the product feel intelligent: one sentence,
 * second person, about what the sender needs from the user. Not a summary.
 */
const EmailInsightSchema = new Schema(
  {
    emailId: { type: Schema.Types.ObjectId, ref: 'MailEmail', required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },

    priority: { type: String, enum: PRIORITIES, required: true, index: true },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    insight: { type: String, required: true },
    needsReply: { type: Boolean, default: false },
    deadlineAt: { type: Date, default: null },
    confidence: { type: Number, default: null },
    modelUsed: { type: String, default: '' },
  },
  { timestamps: true, collection: 'mail_email_insights' }
);

EmailInsightSchema.index({ userId: 1, priority: 1 });

module.exports = model('MailEmailInsight', EmailInsightSchema);
module.exports.PRIORITIES = PRIORITIES;
module.exports.CATEGORIES = CATEGORIES;
