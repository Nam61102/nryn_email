'use strict';

const { Schema, model } = require('mongoose');

/**
 * A user *is* a Google account — the Gmail consent screen is the login.
 * There is no password, no signup form.
 */
const UserSchema = new Schema(
  {
    googleSub: { type: String, required: true, unique: true, index: true }, // stable Google account id
    email: { type: String, required: true },
    displayName: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'mail_users' }
);

module.exports = model('MailUser', UserSchema);
