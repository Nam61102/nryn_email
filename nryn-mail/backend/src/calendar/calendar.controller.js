'use strict';

const calendarService = require('./calendar.service');
const log = require('../utils/logger');

async function getEvents(req, res, next) {
  try {
    const userId = req.user._id;
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const data = await calendarService.getEventsForDate(userId, dateStr);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getMonthSummary(req, res, next) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const data = await calendarService.getMonthSummary(userId, year, month);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function postBriefing(req, res, next) {
  try {
    const userId = req.user._id;
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: 'eventId_required' });
    const data = await calendarService.generateBriefing(userId, eventId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function postReschedule(req, res, next) {
  try {
    const userId = req.user._id;
    const { eventId, newDate, newTime } = req.body;
    if (!eventId || !newDate || !newTime) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const event = await calendarService.rescheduleEvent(userId, eventId, newDate, newTime);
    res.json({ ok: true, event });
  } catch (err) {
    next(err);
  }
}

async function postCreate(req, res, next) {
  try {
    const userId = req.user._id;
    const event = await calendarService.createEvent(userId, req.body);
    res.status(201).json({ ok: true, event });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getEvents,
  getMonthSummary,
  postBriefing,
  postReschedule,
  postCreate,
};
