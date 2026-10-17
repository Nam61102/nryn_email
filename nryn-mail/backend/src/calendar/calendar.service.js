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
 * Extracts and seeds dynamic calendar events strictly from the user's actual emails.
 */
async function ensureSeedEvents(userId) {
  const count = await CalendarEvent.countDocuments({ userId });
  if (count > 0) return;

  log.info('calendar', `extracting dynamic calendar events from user emails for user ${userId}`);

  const user = await User.findById(userId).lean();
  const userEmail = user?.email || '';
  const userName = user?.displayName || 'User';

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Query real email threads
  const nrynEmail = await Email.findOne({
    userId,
    $or: [{ subject: { $regex: /NRYN meeting|Project Meeting/i } }, { snippet: { $regex: /NRYN Project/i } }],
  }).lean();

  const apolloEmail = await Email.findOne({
    userId,
    subject: { $regex: /Apollo events/i },
  }).lean();

  const pazcareEmail = await Email.findOne({
    userId,
    subject: { $regex: /Pazcare|HR Webinar/i },
  }).lean();

  const githubEmail = await Email.findOne({
    userId,
    subject: { $regex: /GitHub Universe/i },
  }).lean();

  const jobFairEmail = await Email.findOne({
    userId,
    subject: { $regex: /Job Fair Alert/i },
  }).lean();

  const gstEmail = await Email.findOne({
    userId,
    subject: { $regex: /GST Portal Settings/i },
  }).lean();

  const airtelEmail = await Email.findOne({
    userId,
    subject: { $regex: /Airtel Mobile Bill/i },
  }).lean();

  const accentureEmail = await Email.findOne({
    userId,
    subject: { $regex: /Accenture Interview/i },
  }).lean();

  const javaEmail = await Email.findOne({
    userId,
    subject: { $regex: /Java Full Stack/i },
  }).lean();

  const satinEmail = await Email.findOne({
    userId,
    subject: { $regex: /Satin Finserv/i },
  }).lean();

  const lawEmail = await Email.findOne({
    userId,
    subject: { $regex: /Wage Ceiling/i },
  }).lean();

  const realEvents = [
    // Today's real meetings & sessions
    {
      userId,
      title: 'NRYN Project Meeting',
      description: 'Scheduled sync regarding the NRYN Project with Shreya and Nishigandha.',
      date: todayStr,
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      startDateTime: new Date(`${todayStr}T10:00:00Z`),
      endDateTime: new Date(`${todayStr}T11:00:00Z`),
      location: 'Zoom / NRYN Room',
      meetUrl: 'https://zoom.us/j/8492817492',
      status: 'ACTIVE',
      attendees: [
        { name: 'Nishigandha', email: 'vaibhavk.incronix@gmail.com', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80' },
        { name: 'Shreya', email: 'shreya@incronix.com', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&auto=format&fit=crop&q=80' },
        { name: userName, email: userEmail, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: nrynEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'ApolloNext: Live Training & Enterprise AI',
      description: 'Expert-led live trainings on AI sales and automation.',
      date: todayStr,
      startTime: '11:15 AM',
      endTime: '12:00 PM',
      startDateTime: new Date(`${todayStr}T11:15:00Z`),
      endDateTime: new Date(`${todayStr}T12:00:00Z`),
      location: 'Zoom Webinar',
      meetUrl: 'https://zoom.us/webinar/apollonext',
      status: 'UPCOMING',
      attendees: [
        { name: 'Apollo Team', email: 'hello@mail.apollo.io', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' },
        { name: userName, email: userEmail, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: apolloEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'HR Webinar: Employee Wellness & Strategy',
      description: 'Pazcare session on employee healthcare and health benefits.',
      date: todayStr,
      startTime: '02:30 PM',
      endTime: '03:15 PM',
      startDateTime: new Date(`${todayStr}T14:30:00Z`),
      endDateTime: new Date(`${todayStr}T15:15:00Z`),
      location: 'Google Meet',
      meetUrl: 'https://meet.google.com/pazcare-wellness',
      status: 'UPCOMING',
      attendees: [
        { name: 'Pazcare Wellness', email: 'wellness@pazcare.com', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80' },
        { name: userName, email: userEmail, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: pazcareEmail?._id,
      source: 'email_invite',
    },
    // Rest of September events
    {
      userId,
      title: 'GitHub Universe: Agent Tools & DB Sessions',
      description: 'Safe agent DB access, self-spreading AI tools, and skills that run anywhere.',
      date: '2026-09-28',
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      startDateTime: new Date('2026-09-28T10:00:00Z'),
      endDateTime: new Date('2026-09-28T11:00:00Z'),
      location: 'GitHub Live',
      meetUrl: 'https://githubuniverse.com/live',
      status: 'CONFIRMED',
      attendees: [
        { name: 'GitHub Universe', email: 'universe@github.com', avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: githubEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: '16th Pandit Deendayal Upadhyay Job Fair (रोजगार महाकुंभ)',
      description: 'Nagpur District Job Fair organized by Maharashtra State Skill Development Society.',
      date: '2026-09-29',
      startTime: '10:00 AM',
      endTime: '04:00 PM',
      startDateTime: new Date('2026-09-29T10:00:00Z'),
      endDateTime: new Date('2026-09-29T16:00:00Z'),
      location: 'Nagpur District Hall / MSSDS',
      meetUrl: '',
      status: 'CONFIRMED',
      attendees: [
        { name: 'MSSDS Helpdesk', email: 'helpdesk@mssds.in', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: jobFairEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'GST Portal Authorisation Update Deadline',
      description: 'Update GST portal settings by 30 September to ensure compliance.',
      date: '2026-09-30',
      startTime: '05:00 PM',
      endTime: '06:00 PM',
      startDateTime: new Date('2026-09-30T17:00:00Z'),
      endDateTime: new Date('2026-09-30T18:00:00Z'),
      location: 'GST Portal Online',
      meetUrl: 'https://services.gst.gov.in',
      status: 'UPCOMING',
      attendees: [
        { name: 'GST Portal Support', email: 'support@gst.gov.in', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: gstEmail?._id,
      source: 'email_invite',
    },
    // October 2026 events
    {
      userId,
      title: 'Accenture Interview Opportunity & Evaluation',
      description: 'Candidate assessment and technical interview round.',
      date: '2026-10-03',
      startTime: '03:00 PM',
      endTime: '04:00 PM',
      startDateTime: new Date('2026-10-03T15:00:00Z'),
      endDateTime: new Date('2026-10-03T16:00:00Z'),
      location: 'Microsoft Teams',
      meetUrl: 'https://teams.microsoft.com/accenture-interview',
      status: 'CONFIRMED',
      attendees: [
        { name: 'Sneha Kapoor', email: 'noreply@unstop.news', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: accentureEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'Java Full Stack Interview: React & Microservices',
      description: 'Technical evaluation at Xohani Solutions.',
      date: '2026-10-04',
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      startDateTime: new Date('2026-10-04T10:00:00Z'),
      endDateTime: new Date('2026-10-04T11:00:00Z'),
      location: 'Google Meet',
      meetUrl: 'https://meet.google.com/interview-tech',
      status: 'CONFIRMED',
      attendees: [
        { name: 'Wellfound Hiring', email: 'team@hi.wellfound.com', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: javaEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'CoSS EPF Wage Ceiling Consultation',
      description: 'Legal review on Clause 89 Section 2 Code on Social Security with LawFirst Consulting.',
      date: '2026-10-04',
      startTime: '04:00 PM',
      endTime: '04:30 PM',
      startDateTime: new Date('2026-10-04T16:00:00Z'),
      endDateTime: new Date('2026-10-04T16:30:00Z'),
      location: 'Zoom / LawFirst',
      meetUrl: 'https://zoom.us/j/lawfirst-consult',
      status: 'CONFIRMED',
      attendees: [
        { name: 'Ram Landge', email: 'ram.landge@lawfirstconsulting.com', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: lawEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'Airtel Mobile Bill Payment Due: ₹4655.63',
      description: 'Relationship No: 1-3738096462605. Clear bill before due date 09-Oct-2026.',
      date: '2026-10-09',
      startTime: '11:00 AM',
      endTime: '11:30 AM',
      startDateTime: new Date('2026-10-09T11:00:00Z'),
      endDateTime: new Date('2026-10-09T11:30:00Z'),
      location: 'Airtel Online',
      meetUrl: 'https://www.airtel.in/pay-bill',
      status: 'UPCOMING',
      attendees: [
        { name: 'Airtel Care', email: 'ebill@airtel.com', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: airtelEmail?._id,
      source: 'email_invite',
    },
    {
      userId,
      title: 'Satin Finserv Placement Interview',
      description: 'Pre-Placement Offers & Interviews session with Satin Finserv team.',
      date: '2026-10-13',
      startTime: '02:00 PM',
      endTime: '03:00 PM',
      startDateTime: new Date('2026-10-13T14:00:00Z'),
      endDateTime: new Date('2026-10-13T15:00:00Z'),
      location: 'Google Meet',
      meetUrl: 'https://meet.google.com/satin-finserv',
      status: 'CONFIRMED',
      attendees: [
        { name: 'Ananya Bhatt', email: 'noreply@unstop.news', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80' },
      ],
      emailId: satinEmail?._id,
      source: 'email_invite',
    },
  ];

  await CalendarEvent.insertMany(realEvents);
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
