import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, emailApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLiveUpdates } from '../lib/socket';
import { colors } from '../lib/theme';
import type { InboxResponse, InboxRow } from '../lib/types';
import { Avatar, ErrorNote, Loading, Toast, formatWhen } from '../ui/components';
import { BottomNav } from '../ui/BottomNav';

type StatFilter = 'all' | 'unread' | 'priority' | 'need_reply';

export default function Inbox() {
  const { me, loading: authLoading, accounts, activeEmail, switchAccount, addAccount } = useAuth();
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatFilter>('all');
  const [seeAllOther, setSeeAllOther] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string; hint?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!authLoading && !me) router.replace('/');
  }, [authLoading, me]);

  const load = useCallback(async () => {
    try {
      const res = await emailApi.inbox(true);
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return router.replace('/');
        setError({ title: 'Could not load the inbox', detail: err.message, hint: err.hint });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Auto-poll inbox every 20 seconds while user is on this screen
      const timer = setInterval(() => {
        load();
      }, 20000);

      return () => clearInterval(timer);
    }, [load])
  );

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSelectAccount = useCallback(
    async (email: string) => {
      const currentActive = (activeEmail || me?.user?.email || '').toLowerCase();
      if (currentActive === email.toLowerCase()) return;
      setLoading(true);
      try {
        await switchAccount(email);
        const res = await emailApi.inbox(true);
        setData(res);
        showToast(`Switched to ${email}`);
      } catch {
        showToast(`Failed to switch to ${email}`);
      } finally {
        setLoading(false);
      }
    },
    [activeEmail, me?.user?.email, switchAccount, showToast]
  );

  const handleAddAccount = useCallback(async () => {
    try {
      await addAccount();
    } catch {
      showToast('Could not start email connection');
    }
  }, [addAccount, showToast]);

  useLiveUpdates(
    Boolean(me),
    {
      onSynced: ({ count }) => {
        load();
        if (count > 0) showToast(`${count} new email${count === 1 ? '' : 's'} synced.`);
      },
      onNewInsight: ({ fromName, insight }) => {
        load();
        showToast(`${fromName}: ${insight}`);
      },
    },
    activeEmail
  );

  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    showToast('Checking for new emails…');
    try {
      // 1. Instantly reload existing database rows
      await load();

      // 2. Trigger fresh sync from Gmail for the active account
      try {
        const res = await emailApi.sync();
        if (res && res.sync && res.sync.inserted > 0) {
          showToast(`${res.sync.inserted} new email${res.sync.inserted === 1 ? '' : 's'} fetched!`);
        } else {
          showToast('Inbox is up to date.');
        }
      } catch (syncErr: any) {
        if (syncErr?.code === 'reauth_required') {
          showToast('Gmail access expired — reconnect in Account.');
        } else {
          showToast('Inbox refreshed.');
        }
      }

      // 3. Final load to ensure all new parsed emails render
      await load();
    } catch (err: any) {
      showToast(err?.message || 'Could not refresh inbox.');
    } finally {
      setRefreshing(false);
    }
  }

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const userName = useMemo(() => {
    if (!me?.user?.displayName) return 'There';
    return me.user.displayName.trim().split(/\s+/)[0];
  }, [me?.user?.displayName]);

  const stats = data?.stats;
  const unreadCount = stats?.unread ?? 0;
  const priorityCount = stats?.needsAttention ?? data?.priority.length ?? 0;
  const needReplyCount = stats?.needsReply ?? 0;

  const priorityEmails = useMemo(() => {
    if (!data?.priority) return [];
    if (filter === 'unread') return data.priority.filter((r) => r.isUnread);
    if (filter === 'need_reply') return data.priority.filter((r) => r.needsReply);
    return data.priority;
  }, [data?.priority, filter]);

  const allFilteredOther = useMemo(() => {
    if (!data?.other) return [];
    if (filter === 'priority') return [];
    if (filter === 'unread') return data.other.filter((r) => r.isUnread);
    if (filter === 'need_reply') return data.other.filter((r) => r.needsReply);
    return data.other;
  }, [data?.other, filter]);

  const otherEmails = useMemo(() => {
    return seeAllOther ? allFilteredOther : allFilteredOther.slice(0, 5);
  }, [allFilteredOther, seeAllOther]);

  if (loading && !data) return <Loading label="Loading your emails…" />;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.push('/account')}
          style={s.topBarBtn}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.topBarTitle}>Emails</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh emails"
          onPress={onRefresh}
          style={({ pressed }) => [
            s.topBarBtn,
            { cursor: 'pointer' },
            pressed && { opacity: 0.5, transform: [{ scale: 0.9 }] },
          ]}
          hitSlop={14}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="refresh-cw" size={18} color={colors.primary} />
          )}
        </Pressable>
      </SafeAreaView>

      {toast ? <Toast text={toast} onClose={() => setToast(null)} /> : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {error ? <ErrorNote title={error.title} detail={error.detail} hint={error.hint} /> : null}

        {/* Top Greeting Card */}
        <View style={s.greetingCard}>
          <View style={s.greetingHeader}>
            <Avatar name={me?.user?.displayName || 'User'} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.greetingTitle}>
                {greeting}, {userName}
              </Text>
              <Text style={s.greetingSubtitle}>
                You have {unreadCount} unread emails.{' '}
                <Text style={s.greetingHighlight}>
                  {priorityCount} require your immediate attention.
                </Text>
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [s.reviewBtn, pressed && { opacity: 0.9 }]}
            onPress={() => {
              if (data?.priority && data.priority.length > 0) {
                router.push(`/email/${data.priority[0].id}`);
              } else {
                showToast('No pending priority emails right now.');
              }
            }}
          >
            <Feather name="zap" size={16} color={colors.white} />
            <Text style={s.reviewBtnText}>REVIEW PRIORITY</Text>
          </Pressable>
        </View>

        {/* Connected Email Accounts Switcher */}
        <View style={s.accountSwitcherSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.accountSwitcherList}
          >
            {accounts.map((acc) => {
              const currentActive = (activeEmail || me?.user?.email || '').toLowerCase();
              const isSelected = currentActive === acc.emailAddress.toLowerCase();
              return (
                <Pressable
                  key={acc.emailAddress}
                  onPress={() => handleSelectAccount(acc.emailAddress)}
                  style={({ pressed }) => [
                    s.accountChip,
                    isSelected && s.accountChipActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to account ${acc.emailAddress}`}
                >
                  <View style={[s.accountDot, isSelected && s.accountDotActive]} />
                  <Text
                    style={[s.accountChipText, isSelected && s.accountChipTextActive]}
                    numberOfLines={1}
                  >
                    {acc.emailAddress}
                  </Text>
                  {isSelected && (
                    <View style={s.accountActiveBadge}>
                      <Feather name="check" size={10} color={colors.white} />
                    </View>
                  )}
                </Pressable>
              );
            })}

            <Pressable
              onPress={handleAddAccount}
              style={({ pressed }) => [s.addAccountBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add another email account"
            >
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={s.addAccountBtnText}>Add Email</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <Pressable
            style={({ pressed }) => [
              s.statItem,
              filter === 'unread' && s.statItemActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              const next = filter === 'unread' ? 'all' : 'unread';
              setFilter(next);
              showToast(next === 'all' ? 'Showing all emails' : `Filtered to ${unreadCount} unread emails`);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Filter by unread emails: ${unreadCount}`}
          >
            <Feather
              name="mail"
              size={15}
              color={filter === 'unread' ? colors.primary : colors.textMuted}
            />
            <Text style={[s.statText, filter === 'unread' && s.statTextActive]}>
              Unread <Text style={[s.statValue, filter === 'unread' && { color: colors.primary }]}>{unreadCount}</Text>
            </Text>
          </Pressable>

          <Text style={s.statDivider}>·</Text>

          <Pressable
            style={({ pressed }) => [
              s.statItem,
              filter === 'priority' && s.statItemActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              const next = filter === 'priority' ? 'all' : 'priority';
              setFilter(next);
              showToast(next === 'all' ? 'Showing all emails' : `Focused on ${priorityCount} priority emails`);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Filter by priority emails: ${priorityCount}`}
          >
            <Feather name="zap" size={15} color={colors.primary} />
            <Text style={[s.statText, filter === 'priority' && s.statTextActive]}>
              Priority <Text style={[s.statValue, { color: colors.primary }]}>{priorityCount}</Text>
            </Text>
          </Pressable>

          <Text style={s.statDivider}>·</Text>

          <Pressable
            style={({ pressed }) => [
              s.statItem,
              filter === 'need_reply' && s.statItemActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              const next = filter === 'need_reply' ? 'all' : 'need_reply';
              setFilter(next);
              showToast(next === 'all' ? 'Showing all emails' : `Filtered to ${needReplyCount} emails needing reply`);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Filter by emails needing reply: ${needReplyCount}`}
          >
            <Feather
              name="corner-up-left"
              size={15}
              color={filter === 'need_reply' ? colors.primary : colors.textMuted}
            />
            <Text style={[s.statText, filter === 'need_reply' && s.statTextActive]}>
              Need Reply <Text style={[s.statValue, filter === 'need_reply' && { color: colors.primary }]}>{needReplyCount}</Text>
            </Text>
          </Pressable>
        </View>

        {/* PRIORITY INBOX Section */}
        <View style={s.sectionHeaderWithAction}>
          <Text style={s.sectionTitle}>
            {filter === 'need_reply' ? 'NEED REPLY' : 'PRIORITY INBOX'}
            {filter !== 'all' ? ` (${priorityEmails.length})` : ''}
          </Text>
          {filter !== 'all' ? (
            <Pressable onPress={() => setFilter('all')} hitSlop={8}>
              <Text style={s.clearFilterText}>Show All ✕</Text>
            </Pressable>
          ) : null}
        </View>

        {priorityEmails.length > 0 ? (
          priorityEmails.map((row) => (
            <Pressable
              key={row.id}
              style={({ pressed }) => [s.priorityCard, pressed && { opacity: 0.95 }]}
              onPress={() => router.push(`/email/${row.id}`)}
            >
              <View style={s.priorityCardHeader}>
                <View style={s.prioritySenderAvatar}>
                  <Feather name="user" size={16} color={colors.textMuted} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={s.prioritySenderName}>{row.fromName || 'Unknown Sender'}</Text>
                  <Text style={s.prioritySenderCategory}>
                    {row.category || (row.priority === 'urgent' ? 'High Importance' : 'Client Update')}
                  </Text>
                </View>
                {row.priority === 'urgent' ? (
                  <View style={s.urgentBadge}>
                    <Text style={s.urgentBadgeText}>URGENT</Text>
                  </View>
                ) : (
                  <View style={s.actionBadge}>
                    <Feather name="zap" size={10} color="#D97706" />
                    <Text style={s.actionBadgeText}>ACTION REQ</Text>
                  </View>
                )}
              </View>

              <Text style={s.prioritySubject}>{row.subject || '(No Subject)'}</Text>

              {row.insight ? (
                <View style={s.insightBox}>
                  <Feather name="zap" size={14} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={s.insightText}>{row.insight}</Text>
                </View>
              ) : null}

              <View style={s.priorityCardFooter}>
                <View style={s.readTimeRow}>
                  <Feather name="clock" size={12} color={colors.textMuted} />
                  <Text style={s.readTimeText}>
                    {Math.max(1, Math.ceil((row.snippet?.split(' ').length || 20) / 100))} min read
                  </Text>
                </View>
                <View style={s.openRow}>
                  <Text style={s.openText}>OPEN</Text>
                  <Feather name="arrow-right" size={13} color={colors.text} />
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={s.emptyCard}>
            <Feather name="check-circle" size={24} color={colors.success} />
            <Text style={s.emptyTitle}>
              {filter === 'all' ? 'Priority inbox is clear' : 'No matching priority emails'}
            </Text>
            <Text style={s.emptyDetail}>
              {filter === 'all'
                ? 'No emails currently require immediate attention.'
                : `No priority emails match the "${filter === 'unread' ? 'Unread' : filter === 'priority' ? 'Priority' : 'Need Reply'}" filter.`}
            </Text>
          </View>
        )}

        {/* TODAY Section */}
        {filter !== 'priority' ? (
          <>
            <View style={s.sectionHeaderWithAction}>
              <Text style={s.sectionTitle}>
                {filter === 'unread' ? 'OTHER UNREAD' : filter === 'need_reply' ? 'OTHER NEED REPLY' : 'TODAY'}
                {filter !== 'all' ? ` (${allFilteredOther.length})` : ''}
              </Text>
              {allFilteredOther.length > 5 ? (
                <Pressable onPress={() => setSeeAllOther(!seeAllOther)} hitSlop={8}>
                  <Text style={s.seeAllText}>{seeAllOther ? 'Show Less' : 'See All'}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={s.otherListContainer}>
              {otherEmails.length > 0 ? (
                otherEmails.map((row, idx) => (
                  <Pressable
                    key={row.id}
                    style={({ pressed }) => [
                      s.otherEmailRow,
                      idx === otherEmails.length - 1 && { borderBottomWidth: 0 },
                      pressed && { backgroundColor: colors.surfaceAlt },
                    ]}
                    onPress={() => router.push(`/email/${row.id}`)}
                  >
                    <View style={s.otherAvatar}>
                      <Feather name="user" size={16} color={colors.textMuted} />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={s.otherRowTop}>
                        <Text style={s.otherSenderName} numberOfLines={1}>
                          {row.fromName || 'Unknown'}
                        </Text>
                        <Text style={s.otherTime}>{formatWhen(row.receivedAt)}</Text>
                      </View>

                      <View style={s.otherSubjectRow}>
                        <Text style={s.otherSubject} numberOfLines={1}>
                          {row.subject || '(No Subject)'}
                        </Text>
                        {row.attachmentCount > 0 ? (
                          <Feather name="paperclip" size={12} color={colors.textMuted} />
                        ) : null}
                      </View>

                      <Text style={s.otherSnippet} numberOfLines={1}>
                        {row.snippet || 'No preview available.'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={s.noOtherText}>
                  {filter === 'all' ? 'No other emails found.' : 'No other emails match this filter.'}
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* Quick Action Pills */}
        <View style={s.quickActionsRow}>
          <Pressable
            style={s.actionPill}
            onPress={() => {
              if (data?.priority?.[0]?.id) router.push(`/email/${data.priority[0].id}/summary`);
              else showToast('Select an email to ask NRYN');
            }}
          >
            <Feather name="zap" size={14} color={colors.primary} />
            <Text style={s.actionPillText}>Ask NRYN</Text>
          </Pressable>

          <Pressable
            style={s.actionPill}
            onPress={() => {
              if (data?.priority?.[0]?.id) router.push(`/email/${data.priority[0].id}/reply`);
              else showToast('Select an email to draft a reply');
            }}
          >
            <Feather name="edit-3" size={14} color={colors.textMuted} />
            <Text style={s.actionPillText}>Draft Reply</Text>
          </Pressable>

          <Pressable
            style={s.actionPill}
            onPress={() => {
              if (data?.priority?.[0]?.id) router.push(`/email/${data.priority[0].id}/summary`);
              else showToast('Select an email to summarize');
            }}
          >
            <Feather name="file-text" size={14} color={colors.textMuted} />
            <Text style={s.actionPillText}>Summarize Inbox</Text>
          </Pressable>

          <Pressable
            style={s.actionPill}
            onPress={() => showToast('All read emails archived')}
          >
            <Feather name="archive" size={14} color={colors.textMuted} />
            <Text style={s.actionPillText}>Archive Read</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Shared 3-Tab Bottom Bar */}
      <BottomNav activeTab="inbox" />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  topBarBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
  },
  greetingCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    gap: 16,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  greetingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  greetingHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  reviewBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
  },
  reviewBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statItemActive: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  statText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  statTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  statValue: {
    fontWeight: '700',
    color: colors.text,
  },
  statDivider: {
    color: colors.border,
    fontSize: 16,
  },
  sectionHeader: {
    marginTop: 6,
  },
  sectionHeaderWithAction: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  priorityCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    gap: 12,
  },
  priorityCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prioritySenderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prioritySenderName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  prioritySenderCategory: {
    fontSize: 11,
    color: colors.textMuted,
  },
  urgentBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  actionBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  prioritySubject: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  insightBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textBody,
  },
  priorityCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  readTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readTimeText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  emptyDetail: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  otherListContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  otherEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  otherAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otherSenderName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  otherTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  otherSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  otherSubject: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textBody,
    flex: 1,
  },
  otherSnippet: {
    fontSize: 12,
    color: colors.textMuted,
  },
  noOtherText: {
    padding: 20,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    justifyContent: 'space-between',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexBasis: '48%',
    justifyContent: 'center',
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textBody,
  },
  accountSwitcherSection: {
    marginVertical: 2,
  },
  accountSwitcherList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  accountChipActive: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  accountDotActive: {
    backgroundColor: colors.primary,
  },
  accountChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    maxWidth: 160,
  },
  accountChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  accountActiveBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addAccountBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
