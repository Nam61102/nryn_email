import { useCallback, useEffect, useState } from 'react';
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
import type { ActionItem, EmailDetail, SummaryResponse } from '../../../lib/types';
import { ErrorNote, Loading, formatDate, formatWhen } from '../../../ui/components';
import { BottomNav } from '../../../ui/BottomNav';

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string; hint?: string } | null>(null);

  const run = useCallback(
    async (force: boolean) => {
      setError(null);
      try {
        const [detailRes, summaryRes] = await Promise.all([
          emailApi.detail(String(id)),
          emailApi.summarize(String(id), force),
        ]);
        setDetail(detailRes);
        setData(summaryRes);
        setItems(summaryRes.actionItems || []);
      } catch (err) {
        if (err instanceof ApiError) {
          setError({
            title: err.code === 'no_llm_provider' ? 'No AI provider configured' : 'Could not summarize',
            detail: err.message,
            hint: err.hint,
          });
        } else {
          setError({ title: 'Could not summarize' });
        }
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [id]
  );

  useEffect(() => {
    run(false);
  }, [run]);

  async function toggle(item: ActionItem) {
    const itemId = item.id || item._id;
    if (!itemId) return;
    const next = !item.isChecked;
    setItems((list) => list.map((i) => ((i.id || i._id) === itemId ? { ...i, isChecked: next } : i)));
    try {
      const res = await emailApi.toggleActionItem(itemId, next);
      setItems((list) =>
        list.map((i) => ((i.id || i._id) === itemId ? { ...i, isChecked: res.isChecked } : i))
      );
    } catch {
      setItems((list) =>
        list.map((i) => ((i.id || i._id) === itemId ? { ...i, isChecked: !next } : i))
      );
    }
  }

  if (loading && !data) return <Loading label="NRYN is generating AI summary…" />;

  const email = detail?.email;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.topBarBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.topBarTitle}>AI Summary</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Regenerate"
          onPress={() => {
            setRegenerating(true);
            run(true);
          }}
          disabled={regenerating}
          style={s.topBarBtn}
          hitSlop={8}
        >
          <Feather name="refresh-cw" size={16} color={colors.textMuted} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content}>
        {error ? <ErrorNote title={error.title} detail={error.detail} hint={error.hint} /> : null}

        {/* Main AI Card */}
        {email ? (
          <View style={s.mainCard}>
            <View style={s.aiBadgeRow}>
              <Ionicons name="sparkles" size={13} color={colors.primary} />
              <Text style={s.aiBadgeText}>AI GENERATED</Text>
            </View>

            <Text style={s.subject}>{email.subject || '(No Subject)'}</Text>
            <Text style={s.subtitle}>
              From {email.fromName || 'Unknown'} • {formatWhen(email.receivedAt)}
            </Text>
          </View>
        ) : null}

        {/* KEY POINTS */}
        {data && data.keyPoints && data.keyPoints.length > 0 ? (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>KEY POINTS</Text>
            </View>

            <View style={s.card}>
              {data.keyPoints.map((point: string, index: number) => (
                <View
                  key={index}
                  style={[s.keyPointRow, index === data.keyPoints.length - 1 && { marginBottom: 0 }]}
                >
                  <View style={s.checkCircle}>
                    <Feather name="check" size={12} color={colors.primary} />
                  </View>
                  <Text style={s.keyPointText}>{point}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* IMPORTANT Alert Card */}
        {data?.importantNote ? (
          <View style={s.importantCard}>
            <View style={s.importantHeader}>
              <Feather name="alert-triangle" size={14} color="#EF4444" />
              <Text style={s.importantTitle}>IMPORTANT</Text>
            </View>
            <Text style={s.importantText}>{data.importantNote}</Text>
          </View>
        ) : null}

        {/* ACTION ITEMS */}
        {items.length > 0 ? (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>ACTION ITEMS</Text>
            </View>

            <View style={s.card}>
              {items.map((item, index) => (
                <Pressable
                  key={item.id || item._id || index}
                  style={[s.actionItemRow, index === items.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => toggle(item)}
                >
                  <View style={[s.checkbox, item.isChecked && s.checkboxChecked]}>
                    {item.isChecked ? <Feather name="check" size={12} color={colors.white} /> : null}
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.actionItemTitle, item.isChecked && s.actionItemCompleted]}>
                      {item.description}
                    </Text>
                    {item.dueDate || item.assignee ? (
                      <Text style={s.actionItemMeta}>
                        {item.dueDate ? `Due ${formatDate(item.dueDate)}` : ''}
                        {item.dueDate && item.assignee ? ' · ' : ''}
                        {item.assignee ? `Assigned to ${item.assignee}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {/* Bottom Action Buttons */}
        <View style={s.bottomBtnRow}>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.push(`/email/${id}/reply`)}
          >
            <Feather name="edit-3" size={15} color={colors.white} />
            <Text style={s.primaryBtnText}>Draft Reply</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.push(`/email/${id}/reply`)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
            <Text style={s.secondaryBtnText}>Ask AI</Text>
          </Pressable>
        </View>
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
    paddingBottom: 28,
    gap: 14,
  },
  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    gap: 8,
  },
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  subject: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  keyPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  keyPointText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textBody,
  },
  importantCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 14,
    gap: 6,
  },
  importantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  importantTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.6,
  },
  importantText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#991B1B',
  },
  actionItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textStrong,
  },
  actionItemCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  actionItemMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  bottomBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 24,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
