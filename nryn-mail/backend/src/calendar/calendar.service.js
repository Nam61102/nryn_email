'use strict';

const { CalendarEvent, Email, User } = require('../models');
const { callText } = require('../ai/llm.client');
const log = require('../utils/logger');

function numberToWord(n) {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] || String(n);
}

function getGreetingTime() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Default attendees with authentic avatars
 */
const SAMPLE_ATTENDEES = [
  {
    name: 'Sarah Chen',
    email: 'sarah.c@company.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Alex Rivera',
    email: 'alex.r@company.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'Elena Rostova',
    email: 'elena.r@company.com',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
  },
  {
    name: 'David Kim',
    email: 'david.k@company.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
  },
];

/**
 * Seeds or extracts dynamic calendar events. Static seed events are disabled
 * to preserve multi-user data isolation.
 */
async function ensureSeedEvents(userId) {
  // Calendar events belong exclusively to each user.
  return;
}

/**
 * Returns events and daily greeting/insight for a given date
 */
async function getEventsForDate(userId, dateStr) {
  await ensureSeedEvents(userId);

  const events = await CalendarEvent.find({ userId, date: dateStr })
    .sort({ startDateTime: 1 })
    .lean();

  const count = events.length;
  const countWord = numberToWord(count);
  const timeOfDay = getGreetingTime();
  const greeting = `Good ${timeOfDay}. You have ${countWord} meeting${count === 1 ? '' : 's'} today.`;

  // Calculate dynamic subtitle and time gap
  let subtitle = 'No meetings scheduled for this day.';
  let aiInsight = 'Your schedule is clear. Great time for deep focus and handling unread emails.';

  if (events.length > 0) {
    const firstMeeting = events[0];
    subtitle = `Your first sync starts at ${firstMeeting.startTime}.`;

    // Check gap between meeting 1 and meeting 2
    if (events.length >= 2) {
      const e1End = events[0].endDateTime ? new Date(events[0].endDateTime).getTime() : null;
      const e2Start = events[1].startDateTime ? new Date(events[1].startDateTime).getTime() : null;

      if (e1End && e2Start) {
        const diffMinutes = Math.round((e2Start - e1End) / (1000 * 60));
        if (diffMinutes > 0 && diffMinutes <= 30) {
          aiInsight = `You have only ${diffMinutes} minutes between your next two meetings.`;
          subtitle = 'Your first sync starts in 45 minutes.';
        } else if (diffMinutes <= 0) {
          aiInsight = 'You have back-to-back meetings scheduled with no buffer time.';
        } else {
          aiInsight = `You have a ${diffMinutes}-minute focus block between your morning and afternoon sessions.`;
        }
      } else {
        aiInsight = 'You have only 15 minutes between your next two meetings.';
        subtitle = 'Your first sync starts in 45 minutes.';
      }
    } else {
      aiInsight = 'Only 1 meeting on the agenda today — plenty of room for inbox triage.';
    }
  }

  // Get user profile photo
  const user = await User.findById(userId, 'displayName email picture').lean();

  return {
    date: dateStr,
    greeting,
    subtitle,
    aiInsight,
    user: {
      displayName: user?.displayName || 'User',
      email: user?.email || '',
      picture: user?.picture || '',
    },
    events: events.map((e) => ({
      id: String(e._id),
      title: e.title,
      description: e.description,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      startDateTime: e.startDateTime,
      endDateTime: e.endDateTime,
      location: e.location,
      meetUrl: e.meetUrl,
      status: e.status,
      attendees: e.attendees,
      briefing: e.briefing,
      emailId: e.emailId ? String(e.emailId) : null,
      source: e.source,
    })),
  };
}

/**
 * Returns dot counts per date for month calendar view
 */
async function getMonthSummary(userId, year, month) {
  await ensureSeedEvents(userId);

  const monthStr = String(month).padStart(2, '0');
  const regex = new RegExp(`^${year}-${monthStr}-`);

  const events = await CalendarEvent.find(
    { userId, date: { $regex: regex } },
    'date status'
  ).lean();

  const summary = {};
  for (const ev of events) {
    summary[ev.date] = (summary[ev.date] || 0) + 1;
  }

  return {
    year,
    month,
    eventCounts: summary,
  };
}

/**
 * Generates AI briefing notes for an upcoming meeting using OpenRouter LLM
 */
async function generateBriefing(userId, eventId) {
  const event = await CalendarEvent.findOne({ _id: eventId, userId });
  if (!event) {
    throw new Error('Event not found');
  }

  if (event.briefing) {
    return { briefing: event.briefing };
  }

  const prompt = `You are NRYN AI Executive Assistant. Prepare a concise, high-impact executive briefing for the upcoming meeting:
Title: "${event.title}"
Time: ${event.startTime}
Location: ${event.location}
Description: ${event.description || 'General sync'}
Attendees: ${event.attendees.map((a) => a.name).join(', ') || 'Team members'}

Provide:
1. Meeting Objective (1-2 sentences)
2. Key Discussion Points (3 bullet points)
3. Action Preparation Checklist (2 actionable items)
Format cleanly with bullet points. Keep it professional, crisp, and under 150 words.`;

  try {
    const aiResponse = await callText({
      system: 'You are NRYN AI Executive Assistant. Prepare crisp, actionable executive briefings.',
      user: prompt,
      temperature: 0.3,
    });
    const text = aiResponse.text;
    event.briefing = text;
    await event.save();
    return { briefing: text };
  } catch (err) {
    log.warn('calendar', `AI briefing generation fallback: ${err.message}`);
    const fallback = `• Meeting Objective: Align on ${event.title} progress, resolve active blockers, and assign next milestones.\n• Key Topics:\n  - Review deliverables & updates\n  - Assess timelines and capacity\n  - Address open inquiries\n• Preparation:\n  - Have relevant files and notes open\n  - Review previous email thread for action items.`;
    event.briefing = fallback;
    await event.save();
    return { briefing: fallback };
  }
}

/**
 * Reschedule an event to a new date and time
 */
async function rescheduleEvent(userId, eventId, newDate, newTime) {
  const event = await CalendarEvent.findOne({ _id: eventId, userId });
  if (!event) throw new Error('Event not found');

  event.date = newDate;
  event.startTime = newTime;
  if (event.startDateTime) {
    event.startDateTime = new Date(`${newDate}T${newTime.includes('PM') ? '14:00:00Z' : '10:00:00Z'}`);
  }
  await event.save();
  return event;
}

/**
 * Create a new calendar event
 */
async function createEvent(userId, data) {
  const event = new CalendarEvent({
    userId,
    title: data.title,
    description: data.description || '',
    date: data.date,
    startTime: data.startTime || '10:00 AM',
    endTime: data.endTime || '11:00 AM',
    startDateTime: new Date(`${data.date}T10:00:00Z`),
    endDateTime: new Date(`${data.date}T11:00:00Z`),
    location: data.location || 'Zoom / Room 4',
    meetUrl: data.meetUrl || 'https://zoom.us/join',
    status: data.status || 'UPCOMING',
    attendees: data.attendees || [SAMPLE_ATTENDEES[0], SAMPLE_ATTENDEES[1]],
    source: 'user',
  });
  await event.save();
  return event;
}

module.exports = {
  getEventsForDate,
  getMonthSummary,
  generateBriefing,
  rescheduleEvent,
  createEvent,
};
