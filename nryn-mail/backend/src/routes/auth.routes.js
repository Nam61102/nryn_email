'use strict';

const express = require('express');
const ctrl = require('../auth/auth.controller');
const { requireSession } = require('../auth/session.middleware');

const router = express.Router();

// Public: the button, and Google's redirect back.
// The callback MUST stay outside requireSession — Google sends no cookies of ours.
router.get('/google/url', ctrl.authUrl);
router.get('/google/callback', ctrl.callback);
// The app trades the one-time code from its deep link for a session token here.
router.post('/exchange', ctrl.exchange);

// Authenticated
router.get('/me', requireSession, ctrl.me);
router.post('/disconnect', requireSession, ctrl.disconnect);

module.exports = router;
