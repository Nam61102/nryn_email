'use strict';

const { Schema, model } = require('mongoose');

const AttachmentSchema = new Schema(
  {
    filename: String,
    mimeType: String,
    sizeBytes: Number,
    attachmentId: String,
  },
  { _id: false }
);

/** One document per synced Gmail message. */
const EmailSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'MailEmailAccount', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },

    gmailId: { type: String, required: true },
    threadId: { type: String, required: true, index: true },
    // The RFC822 Message-Id header. Required to thread a reply correctly.
    messageIdHeader: { type: String, default: '' },

    fromName: { type: String, default: '' },
    fromEmail: { type: String, default: '' },
    toEmails: { type: [String], default: [] },
    ccEmails: { type: [String], default: [] },

    subject: { type: String, default: '' },
    snippet: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    attachments: { type: [AttachmentSchema], default: [] },

    labelIds: { type: [String], default: [] },
    isUnread: { type: Boolean, default: true },
    receivedAt: { type: Date, default: Date.now },

    // null means triage has not run on this email yet
    processedAt: { type: Date, default: null },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'mail_emails' }
);

EmailSchema.index({ accountId: 1, gmailId: 1 }, { unique: true });
EmailSchema.index({ userId: 1, receivedAt: -1 });
EmailSchema.index({ accountId: 1, processedAt: 1 });

module.exports = model('MailEmail', EmailSchema);
