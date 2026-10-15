'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../calendar/calendar.controller');
const { requireSession } = require('../auth/session.middleware');

const router = express.Router();

router.use(requireSession);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.userId),
  message: { error: 'rate_limited', hint: 'Too many AI calls in a minute — please wait.' },
});

router.get('/events', ctrl.getEvents);
router.get('/month-summary', ctrl.getMonthSummary);
router.post('/briefing', aiLimiter, ctrl.postBriefing);
router.post('/reschedule', ctrl.postReschedule);
router.post('/events', ctrl.postCreate);

module.exports = router;
