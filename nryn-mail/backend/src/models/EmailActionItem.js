'use strict';

const { Schema, model } = require('mongoose');

/** The checkbox list on the Summary screen. isChecked persists across reloads. */
const EmailActionItemSchema = new Schema(
  {
    emailId: { type: Schema.Types.ObjectId, ref: 'MailEmail', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },

    description: { type: String, required: true },
    dueDate: { type: String, default: '' },  // free text as the model returns it, e.g. "Thursday"
    assignee: { type: String, default: '' },
    isChecked: { type: Boolean, default: false },
    position: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'mail_email_action_items' }
);

EmailActionItemSchema.index({ emailId: 1, position: 1 });

module.exports = model('MailEmailActionItem', EmailActionItemSchema);
