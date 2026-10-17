import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type {
  CalendarEvent,
  CalendarEventsResponse,
  CalendarMonthSummaryResponse,
  Draft,
  EmailDetail,
  InboxResponse,
  Me,
  SessionUser,
  StoredAccount,
  SummaryResponse,
  Tone,
} from './types';

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://nryn-email.onrender.com';
}


export const API_URL = resolveApiUrl();

const TOKEN_KEY = 'nryn_mail_token';
const ACCOUNTS_KEY = 'nryn_mail_accounts';
const ACTIVE_EMAIL_KEY = 'nryn_mail_active_email';

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setStorageItem(key: string, val: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
    } catch {}
    return;
  }
  try {
    await SecureStore.setItemAsync(key, val);
  } catch {}
}

async function removeStorageItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

/**
 * The session token lives in the device keychain / keystore (or localStorage on web),
 * and travels as a Bearer header. Supports multiple connected accounts seamlessly.
 */
export const tokenStore = {
  get: async (): Promise<string | null> => {
    const current = await getStorageItem(TOKEN_KEY);
    if (current) return current;

    const accounts = await tokenStore.getAccounts();
    if (accounts.length > 0) {
      const activeEmail = await getStorageItem(ACTIVE_EMAIL_KEY);
      const matched =
        accounts.find((a) => a.emailAddress.toLowerCase() === activeEmail?.toLowerCase()) ||
        accounts[0];
      await tokenStore.switchAccount(matched.emailAddress);
      return matched.token;
    }
    return null;
  },

  set: async (token: string, email?: string): Promise<void> => {
    await setStorageItem(TOKEN_KEY, token);
    if (email) {
      await tokenStore.addAccount({
        id: email,
        emailAddress: email,
        token,
      });
      await setStorageItem(ACTIVE_EMAIL_KEY, email);
    }
  },

  getAccounts: async (): Promise<StoredAccount[]> => {
    const raw = await getStorageItem(ACCOUNTS_KEY);
    let list: StoredAccount[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {}
    }
    return Array.isArray(list) ? list : [];
  },

  getActiveEmail: async (): Promise<string | null> => {
    const active = await getStorageItem(ACTIVE_EMAIL_KEY);
    if (active) return active;
    const accounts = await tokenStore.getAccounts();
    return accounts[0]?.emailAddress ?? null;
  },

  addAccount: async (acc: StoredAccount): Promise<void> => {
    const accounts = await tokenStore.getAccounts();
    const existingIdx = accounts.findIndex(
      (a) => a.emailAddress.toLowerCase() === acc.emailAddress.toLowerCase()
    );
    if (existingIdx >= 0) {
      accounts[existingIdx] = { ...accounts[existingIdx], ...acc };
    } else {
      accounts.push(acc);
    }
    await setStorageItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  },

  removeAccount: async (email: string): Promise<void> => {
    const accounts = await tokenStore.getAccounts();
    const filtered = accounts.filter(
      (a) => a.emailAddress.toLowerCase() !== email.toLowerCase()
    );
    await setStorageItem(ACCOUNTS_KEY, JSON.stringify(filtered));
    const activeEmail = await getStorageItem(ACTIVE_EMAIL_KEY);
    if (activeEmail && activeEmail.toLowerCase() === email.toLowerCase()) {
      if (filtered.length > 0) {
        await tokenStore.switchAccount(filtered[0].emailAddress);
      } else {
        await tokenStore.clearAll();
      }
    }
  },

  switchAccount: async (email: string): Promise<string | null> => {
    const accounts = await tokenStore.getAccounts();
    const target = accounts.find((a) => a.emailAddress.toLowerCase() === email.toLowerCase());
    if (target) {
      await setStorageItem(TOKEN_KEY, target.token);
      await setStorageItem(ACTIVE_EMAIL_KEY, target.emailAddress);
      return target.token;
    }
    return null;
  },

  clear: async (): Promise<void> => {
    await tokenStore.clearAll();
  },

  clearAll: async (): Promise<void> => {
    await removeStorageItem(TOKEN_KEY);
    await removeStorageItem(ACTIVE_EMAIL_KEY);
    await removeStorageItem(ACCOUNTS_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  hint?: string;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };

  if (auth) {
    const token = await tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    throw new ApiError(
      0,
      isTimeout ? 'timeout' : 'network_error',
      isTimeout
        ? `Request timed out connecting to NRYN Mail API at ${API_URL}`
        : `Cannot reach the NRYN Mail API at ${API_URL}`,
      'On a phone, "localhost" means the phone. Set EXPO_PUBLIC_API_URL in mobile/.env ' +
        "to your computer's LAN IP, make sure both are on the same Wi-Fi, and that the " +
        'backend is running.'
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'bad_json', message: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const d = (data || {}) as { error?: string; message?: string; hint?: string };
    if (res.status === 401) await tokenStore.clear();
    throw new ApiError(res.status, d.error || 'error', d.message || d.error || res.statusText, d.hint);
  }

  return data as T;
}

const get = <T,>(p: string) => request<T>(p, { method: 'GET' });
const post = <T,>(p: string, body?: unknown, auth = true) =>
  request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, auth);
const patch = <T,>(p: string, body?: unknown) =>
  request<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });

export const authApi = {
  /** Unauthenticated — returns Google's consent URL for this redirect target. */
  connectUrl: (redirectUri: string, linkUserId?: string) =>
    request<{ url: string }>(
      `/api/auth/google/url?redirect=${encodeURIComponent(redirectUri)}${
        linkUserId ? `&linkUser=${encodeURIComponent(linkUserId)}` : ''
      }`,
      { method: 'GET' },
      false
    ),
  /** Trades the one-time code from the deep link for a session token. */
  exchange: (code: string) =>
    post<{ token: string; user: SessionUser }>('/api/auth/exchange', { code }, false),
  me: () => get<Me>('/api/auth/me'),
  disconnect: () => post<{ ok: true }>('/api/auth/disconnect'),
};

export const emailApi = {
  inbox: (includeIgnored = false, accountId?: string) => {
    const params = new URLSearchParams();
    if (includeIgnored) params.append('includeIgnored', '1');
    if (accountId) params.append('accountId', accountId);
    const qs = params.toString();
    return get<InboxResponse>(`/api/email/inbox${qs ? `?${qs}` : ''}`);
  },

  sync: (accountId?: string) =>
    post<{ sync: { mode: string; seen: number; inserted: number }; triage: { processed: number } }>(
      `/api/email/sync${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`
    ),

  detail: (id: string) => get<EmailDetail>(`/api/email/${id}`),

  summarize: (id: string, force = false) =>
    post<SummaryResponse>(`/api/email/${id}/summarize${force ? '?force=1' : ''}`),

  toggleActionItem: (itemId: string, isChecked: boolean) =>
    patch<{ id: string; isChecked: boolean }>(`/api/email/action-items/${itemId}`, { isChecked }),

  listDrafts: (id: string) => get<{ drafts: Draft[] }>(`/api/email/${id}/drafts`),

  generateDraft: (id: string, tone: Tone) =>
    post<{ draft: Draft; versionsForTone: number }>(`/api/email/${id}/draft`, { tone }),

  saveDraft: (draftId: string, body: string) =>
    patch<{ draft: Draft }>(`/api/email/draft/${draftId}`, { body }),

  sendDraft: (draftId: string) =>
    post<{ ok: true; gmailId: string; threadId: string }>(`/api/email/draft/${draftId}/send`),
};

export const calendarApi = {
  getEvents: (date?: string) =>
    get<CalendarEventsResponse>(`/api/calendar/events${date ? `?date=${encodeURIComponent(date)}` : ''}`),

  getMonthSummary: (year?: number, month?: number) =>
    get<CalendarMonthSummaryResponse>(
      `/api/calendar/month-summary${year && month ? `?year=${year}&month=${month}` : ''}`
    ),

  getBriefing: (eventId: string) =>
    post<{ briefing: string }>('/api/calendar/briefing', { eventId }),

  reschedule: (eventId: string, newDate: string, newTime: string) =>
    post<{ ok: true; event: CalendarEvent }>('/api/calendar/reschedule', { eventId, newDate, newTime }),

  createEvent: (data: Partial<CalendarEvent>) =>
    post<{ ok: true; event: CalendarEvent }>('/api/calendar/events', data),
};

