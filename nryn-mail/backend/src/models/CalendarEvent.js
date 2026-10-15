'use strict';

const mongoose = require('mongoose');

const AttendeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, default: '' },
    avatar: { type: String, default: '' },
  },
  { _id: false }
);

const CalendarEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'mail_users',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    startTime: { type: String, required: true }, // e.g. "10:00 AM"
    endTime: { type: String, default: '' }, // e.g. "11:00 AM"
    startDateTime: { type: Date, required: true, index: true },
    endDateTime: { type: Date },
    location: { type: String, default: 'Zoom / Room 4' },
    meetUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['ACTIVE', 'UPCOMING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
      default: 'UPCOMING',
    },
    attendees: { type: [AttendeeSchema], default: [] },
    emailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'mail_emails',
      default: null,
    },
    briefing: { type: String, default: '' },
    source: {
      type: String,
      enum: ['google_calendar', 'email_invite', 'user', 'auto_sync'],
      default: 'email_invite',
    },
  },
  {
    timestamps: true,
    collection: 'mail_calendar_events',
  }
);

CalendarEventSchema.index({ userId: 1, date: 1, startDateTime: 1 });

module.exports = mongoose.model('mail_calendar_events', CalendarEventSchema);
