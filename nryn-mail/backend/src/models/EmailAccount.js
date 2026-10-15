'use strict';

const { Schema, model } = require('mongoose');

/**
 * The connected mailbox and its OAuth tokens.
 * accessToken / refreshToken are AES-256-GCM ciphertext — see utils/crypto.js.
 * Nothing in here is ever serialised to the frontend.
 */
const EmailAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'MailUser', required: true, index: true },
    provider: { type: String, default: 'gmail' },
    emailAddress: { type: String, required: true },

    accessToken: { type: String, required: true },   // encrypted
    refreshToken: { type: String, default: '' },     // encrypted
    tokenExpiry: { type: Date, default: null },
    scopes: { type: [String], default: [] },

    historyId: { type: String, default: null },      // Gmail incremental-sync cursor
    lastSyncedAt: { type: Date, default: null },
    syncLockedAt: { type: Date, default: null },     // set while a sync runs, cleared after

    status: {
      type: String,
      enum: ['active', 'reauth_required', 'revoked'],
      default: 'active',
      index: true,
    },
    lastError: { type: String, default: '' },
  },
  { timestamps: true, collection: 'mail_email_accounts' }
);

EmailAccountSchema.index({ userId: 1, emailAddress: 1 }, { unique: true });

module.exports = model('MailEmailAccount', EmailAccountSchema);
