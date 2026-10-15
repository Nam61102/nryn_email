'use strict';

/**
 * AES-256-GCM for Gmail tokens at rest.
 *
 * A leaked database dump here is a leaked mailbox, so the refresh token never
 * sits in plaintext. Format stored in Mongo:  <iv-hex>:<authTag-hex>:<cipher-hex>
 */

const crypto = require('crypto');
const env = require('../config/env');

const KEY = Buffer.from(env.tokenEncryptionKey, 'hex'); // 32 bytes, validated in env.js
const IV_BYTES = 12; // GCM standard

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return '';
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('encrypted value is malformed — was TOKEN_ENCRYPTION_KEY changed?');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

/** Single-use, short-lived OAuth state value (CSRF protection on the callback). */
function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { encrypt, decrypt, randomToken };
