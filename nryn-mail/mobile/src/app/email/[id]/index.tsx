import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, emailApi } from '../../../lib/api';
import { colors } from '../../../lib/theme';
import type { EmailDetail } from '../../../lib/types';
import { Avatar, ErrorNote, Loading, formatBytes, formatWhen } from '../../../ui/components';
import { BottomNav } from '../../../ui/BottomNav';

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    emailApi
      .detail(String(id))
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : 'Failed to load'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.topBar}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <Text style={s.topBarTitle}>Email Details</Text>
          <View style={{ width: 36 }} />
        </SafeAreaView>
        <View style={{ padding: 18 }}>
          <ErrorNote title="Could not open this email" detail={error} />
        </View>
        <BottomNav activeTab="inbox" />
      </View>
    );
  }

  if (!data) return <Loading label="Loading email…" />;

  const { email, insight } = data;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.topBarTitle}>Email Details</Text>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content}>
        {/* Sender Header */}
        <View style={s.senderRow}>
          <View style={s.avatarWrapper}>
            <Avatar name={email.fromName || 'Sender'} size={44} />
            <View style={s.onlineBadge} />
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.senderName}>{email.fromName || 'Unknown Sender'}</Text>
            <Text style={s.senderMeta}>
              {insight?.category || 'Inbox'} • {formatWhen(email.receivedAt)}
            </Text>
          </View>

          <Pressable
            style={s.replyIconBtn}
            onPress={() => router.push(`/email/${id}/reply`)}
            hitSlop={8}
          >
            <Feather name="corner-up-left" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Pressable style={s.toMeRow}>
          <Text style={s.toMeText}>To: Me</Text>
          <Feather name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>

        {/* Email Subject */}
        <Text style={s.subject}>{email.subject || '(No Subject)'}</Text>

        {/* Email Body */}
        <Text style={s.bodyText}>
          {email.bodyText || '(This email has no plain text content.)'}
        </Text>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 ? (
          <View style={s.attachmentsSection}>
            {email.attachments.map((a, i) => (
              <View key={a.attachmentId || i} style={s.attachmentCard}>
                <View style={s.pdfIconWrapper}>
                  <Feather name="file-text" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.attachmentName} numberOfLines={1}>
                    {a.filename}
                  </Text>
                  <Text style={s.attachmentSize}>{formatBytes(a.sizeBytes)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Action Buttons Row */}
        <View style={s.actionsRow}>
          <Pressable
            style={({ pressed }) => [s.summarizeBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.push(`/email/${id}/summary`)}
          >
            <Ionicons name="sparkles" size={15} color={colors.primary} />
            <Text style={s.summarizeBtnText}>Summarize with NRYN</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.draftBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.push(`/email/${id}/reply`)}
          >
            <Feather name="edit-3" size={15} color={colors.textBody} />
            <Text style={s.draftBtnText}>Draft Reply</Text>
          </Pressable>
        </View>

        {/* NRYN Insight Card */}
        {insight && !insightDismissed ? (
          <View style={s.insightCard}>
            <View style={s.insightHeader}>
              <Feather name="chevron-left" size={14} color={colors.primary} />
              <Text style={s.insightHeaderTitle}>NRYN INSIGHT</Text>
            </View>

            <Text style={s.insightText}>{insight.insight}</Text>

            <View style={s.insightActions}>
              <Pressable onPress={() => setInsightDismissed(true)} hitSlop={10}>
                <Text style={s.dismissText}>Dismiss</Text>
              </Pressable>

              <Pressable
                style={s.approveBtn}
                onPress={() => router.push(`/email/${id}/reply`)}
              >
                <Feather name="check" size={14} color={colors.primary} />
                <Text style={s.approveBtnText}>
                  {/approv/i.test(insight.insight)
                    ? 'Approve Budget'
                    : insight.needsReply
                    ? 'Reply Now'
                    : 'Take Action'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Shared Bottom Nav */}
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
  backBtn: {
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
    paddingBottom: 32,
    gap: 14,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  senderMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  replyIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -4,
  },
  toMeText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  subject: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 28,
    marginVertical: 4,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textBody,
  },
  attachmentsSection: {
    gap: 10,
    marginTop: 8,
  },
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  pdfIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  attachmentSize: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  summarizeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingVertical: 12,
    borderRadius: 24,
  },
  summarizeBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 24,
  },
  draftBtnText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '700',
  },
  insightCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFEDD5',
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  insightHeaderTitle: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  insightText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: 20,
  },
  insightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 4,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  approveBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
