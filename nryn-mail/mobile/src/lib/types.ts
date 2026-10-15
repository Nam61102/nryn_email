export type Priority = 'urgent' | 'action_required' | 'fyi' | 'ignore';
export type Tone = 'professional' | 'friendly' | 'concise';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
}

export interface AccountStatus {
  id: string;
  emailAddress: string;
  status: 'active' | 'reauth_required' | 'revoked';
  lastSyncedAt: string | null;
  lastError: string;
  canSend: boolean;
}

export interface Me {
  user: SessionUser;
  account: AccountStatus | null;
}

export interface InboxRow {
  id: string;
  gmailId: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  repliedAt: string | null;
  attachmentCount: number;
  triaged: boolean;
  priority: Priority | null;
  category: string | null;
  insight: string;
  needsReply: boolean;
  deadlineAt: string | null;
}

export interface InboxResponse {
  stats: {
    total: number;
    unread: number;
    needsAttention: number;
    needsReply: number;
    filtered: number;
    untriaged: number;
  };
  priority: InboxRow[];
  other: InboxRow[];
  account: { emailAddress: string; status: string; lastSyncedAt: string | null } | null;
}

export interface Attachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  attachmentId: string;
}

export interface EmailDetail {
  email: {
    id: string;
    gmailId: string;
    threadId: string;
    fromName: string;
    fromEmail: string;
    toEmails: string[];
    subject: string;
    bodyText: string;
    bodyHtml: string;
    attachments: Attachment[];
    receivedAt: string;
    isUnread: boolean;
    repliedAt: string | null;
  };
  insight: {
    priority: Priority;
    category: string;
    insight: string;
    needsReply: boolean;
    deadlineAt: string | null;
    modelUsed: string;
  } | null;
  summary: { keyPoints: string[]; importantNote: string; generatedAt: string } | null;
  actionItems: ActionItem[];
  drafts: Draft[];
}

export interface ActionItem {
  id?: string;
  _id?: string;
  description: string;
  dueDate: string;
  assignee: string;
  isChecked: boolean;
}

export interface SummaryResponse {
  cached: boolean;
  keyPoints: string[];
  importantNote: string;
  generatedAt: string;
  actionItems: ActionItem[];
}

export interface Draft {
  id: string;
  emailId: string;
  tone: Tone;
  body: string;
  version: number;
  isUserEdited: boolean;
  status: 'draft' | 'sent' | 'discarded';
  createdAt: string;
}

export interface CalendarAttendee {
  name: string;
  email?: string;
  avatar?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  startDateTime?: string;
  endDateTime?: string;
  location: string;
  meetUrl: string;
  status: 'ACTIVE' | 'UPCOMING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  attendees: CalendarAttendee[];
  briefing?: string;
  emailId?: string | null;
  source?: string;
}

export interface CalendarEventsResponse {
  date: string;
  greeting: string;
  subtitle: string;
  aiInsight: string;
  user: {
    displayName: string;
    email: string;
    picture: string;
  };
  events: CalendarEvent[];
}

export interface CalendarMonthSummaryResponse {
  year: number;
  month: number;
  eventCounts: Record<string, number>;
}

