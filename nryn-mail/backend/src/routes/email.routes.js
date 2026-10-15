'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../email/email.controller');
const { requireSession } = require('../auth/session.middleware');

const router = express.Router();

// Every route below is authenticated, and every query is scoped to req.userId.
router.use(requireSession);

// The two endpoints that cost real money get their own throttle.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
  message: { error: 'rate_limited', hint: 'Too many AI calls in a minute — wait and retry.' },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => String(req.userId),
  message: { error: 'rate_limited' },
});

router.get('/inbox', ctrl.getInbox);
router.post('/sync', syncLimiter, ctrl.postSync);

// Static segments before /:id so "action-items" and "draft" are never read as ids.
router.patch('/action-items/:id', ctrl.patchActionItem);
router.patch('/draft/:id', ctrl.patchDraft);
router.post('/draft/:id/send', ctrl.postSend);

router.get('/:id', ctrl.getEmail);
router.post('/:id/summarize', aiLimiter, ctrl.postSummarize);
router.get('/:id/drafts', ctrl.getDrafts);
router.post('/:id/draft', aiLimiter, ctrl.postDraft);

module.exports = router;
