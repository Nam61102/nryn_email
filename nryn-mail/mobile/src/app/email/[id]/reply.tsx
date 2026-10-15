import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, emailApi } from '../../../lib/api';
import { colors } from '../../../lib/theme';
import type { Draft, EmailDetail, Tone } from '../../../lib/types';
import { ErrorNote, Loading, Toast } from '../../../ui/components';
import { BottomNav } from '../../../ui/BottomNav';

const TONES: { id: Tone; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'professional', label: 'Professional', icon: 'briefcase-outline' },
  { id: 'friendly', label: 'Friendly', icon: 'happy-outline' },
  { id: 'concise', label: 'Concise', icon: 'swap-vertical-outline' },
];

export default function Reply() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tone, setTone] = useState<Tone>('professional');
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; detail?: string; hint?: string } | null>(null);
  const bootstrapped = useRef(false);

  const forTone = useMemo(
    () => drafts.filter((d) => d.tone === tone).sort((a, b) => a.version - b.version),
    [drafts, tone]
  );
  const current = forTone[Math.min(index, Math.max(forTone.length - 1, 0))] || null;

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const generate = useCallback(
    async (which: Tone) => {
      setGenerating(true);
      setError(null);
      try {
        const res = await emailApi.generateDraft(String(id), which);
        setDrafts((list) => [...list.filter((d) => d.id !== res.draft.id), res.draft]);
        setIndex(res.versionsForTone - 1);
        setEditing(false);
        setEditBody(res.draft.body);
      } catch (err) {
        if (err instanceof ApiError) {
          setError({
            title:
              err.code === 'no_llm_provider' ? 'No AI provider configured' : 'Could not draft a reply',
            detail: err.message,
            hint: err.hint,
          });
        } else {
          setError({ title: 'Could not draft a reply' });
        }
      } finally {
        setGenerating(false);
      }
    },
    [id]
  );

  useEffect(() => {
    let alive = true;
    emailApi
      .detail(String(id))
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setDrafts(d.drafts);
        if (!bootstrapped.current) {
          bootstrapped.current = true;
          const existing = d.drafts.filter((x) => x.tone === 'professional');
          if (existing.length === 0) {
            generate('professional');
          } else {
            setIndex(existing.length - 1);
            setEditBody(existing[existing.length - 1].body);
          }
        }
      })
      .catch((err) => {
        if (alive) {
          setError({
            title: 'Could not load email',
            detail: err instanceof ApiError ? err.message : '',
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [id, generate]);

  useEffect(() => {
    if (current && !editing) {
      setEditBody(current.body);
    }
  }, [current, editing]);

  function handleSelectTone(t: Tone) {
    setTone(t);
    setEditing(false);
    const existing = drafts.filter((d) => d.tone === t);
    if (existing.length === 0) {
      generate(t);
    } else {
      setIndex(existing.length - 1);
      setEditBody(existing[existing.length - 1].body);
    }
  }

  async function handleSaveDraft() {
    if (!current) return;
    setSaving(true);
    try {
      const res = await emailApi.saveDraft(current.id, editBody);
      setDrafts((list) => list.map((d) => (d.id === res.draft.id ? res.draft : d)));
      setEditing(false);
      showToast('Draft saved successfully.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendReply() {
    if (!current) return;
    setSending(true);
    try {
      if (editing || editBody !== current.body) {
        await emailApi.saveDraft(current.id, editBody);
      }
      await emailApi.sendDraft(current.id);
      showToast('Reply sent successfully!');
      setDrafts((list) => list.map((d) => (d.id === current.id ? { ...d, status: 'sent' } : d)));
      setTimeout(() => {
        router.replace('/inbox');
      }, 1200);
    } catch (err: any) {
      if (err?.code === 'already_sent' || err?.message?.includes('already_sent')) {
        showToast('Reply already sent to Gmail!');
        setDrafts((list) => list.map((d) => (d.id === current.id ? { ...d, status: 'sent' } : d)));
        setTimeout(() => {
          router.replace('/inbox');
        }, 1200);
        return;
      }
      showToast(err?.message || 'Failed to send reply.');
      setSending(false);
    }
  }

  if (!detail && !error) return <Loading label="Preparing draft reply…" />;

  const email = detail?.email;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']} style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.topBarBtn} hitSlop={10}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.topBarTitle}>Draft Reply</Text>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      {toast ? <Toast text={toast} onClose={() => setToast(null)} /> : null}

      <ScrollView contentContainerStyle={s.content}>
        {error ? <ErrorNote title={error.title} detail={error.detail} hint={error.hint} /> : null}

        {/* TO & SUBJECT Metadata */}
        {email ? (
          <View style={s.metadataBox}>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>TO:</Text>
              <Text style={s.metaValue}>{email.fromName ? email.fromName.toUpperCase() : email.fromEmail.toUpperCase()}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>SUBJECT:</Text>
              <Text style={s.metaSubject}>
                RE: {email.subject ? email.subject.toUpperCase() : 'NO SUBJECT'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Draft Card */}
        <View style={s.draftCard}>
          <View style={s.draftSparkleWrapper}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
          </View>

          {generating ? (
            <View style={s.generatingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.generatingText}>Drafting in {tone} tone…</Text>
            </View>
          ) : editing ? (
            <TextInput
              style={s.bodyInput}
              multiline
              autoFocus
              value={editBody}
              onChangeText={setEditBody}
              placeholder="Write your reply…"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Text style={s.bodyText}>
              {editBody || current?.body || 'No draft generated yet.'}
            </Text>
          )}
        </View>

        {/* AI TONE */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>AI TONE</Text>
        </View>

        <View style={s.toneRow}>
          {TONES.map((t) => {
            const active = tone === t.id;
            return (
              <Pressable
                key={t.id}
                style={[s.tonePill, active && s.tonePillActive]}
                onPress={() => handleSelectTone(t.id)}
              >
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text style={[s.tonePillText, active && s.tonePillTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            style={s.tonePillMore}
            onPress={() => handleSelectTone(tone === 'concise' ? 'friendly' : 'concise')}
          >
            <Feather name="more-horizontal" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Action Buttons Row */}
        <View style={s.actionCardsRow}>
          <Pressable
            style={({ pressed }) => [s.actionCard, pressed && { opacity: 0.8 }]}
            onPress={() => generate(tone)}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={16} color={colors.text} />
            )}
            <Text style={s.actionCardText}>Regenerate</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.actionCard,
              editing && { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setEditing(!editing)}
          >
            <Feather
              name="edit-2"
              size={16}
              color={editing ? colors.primary : colors.text}
            />
            <Text
              style={[s.actionCardText, editing && { color: colors.primary, fontWeight: '700' }]}
            >
              {editing ? 'Done' : 'Edit'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.actionCard, pressed && { opacity: 0.8 }]}
            onPress={() => showToast('Attachment picker opened.')}
          >
            <Feather name="paperclip" size={16} color={colors.text} />
            <Text style={s.actionCardText}>Attach</Text>
          </Pressable>
        </View>

        {/* Primary Bottom Actions */}
        <View style={s.submitButtonsWrapper}>
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              (sending || !current || current.status === 'sent') && { opacity: 0.6 },
              current?.status === 'sent' && { backgroundColor: '#10B981' },
              pressed && { opacity: 0.9 },
            ]}
            onPress={handleSendReply}
            disabled={sending || !current || current.status === 'sent'}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : current?.status === 'sent' ? (
              <Feather name="check" size={16} color={colors.white} />
            ) : (
              <Ionicons name="paper-plane" size={16} color={colors.white} />
            )}
            <Text style={s.sendBtnText}>
              {sending ? 'Sending Reply…' : current?.status === 'sent' ? 'Reply Sent' : 'Send Reply'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.saveDraftBtn,
              saving && { opacity: 0.6 },
              pressed && { opacity: 0.9 },
            ]}
            onPress={handleSaveDraft}
            disabled={saving || !current}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="save-outline" size={16} color={colors.primary} />
            )}
            <Text style={s.saveDraftBtnText}>
              {saving ? 'Saving…' : 'Save Draft'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Shared Bottom Nav */}
      <BottomNav activeTab="inbox" />
    </KeyboardAvoidingView>
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
  metadataBox: {
    paddingVertical: 4,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    width: 70,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textStrong,
    flex: 1,
  },
  metaSubject: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  draftCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative',
  },
  draftSparkleWrapper: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  generatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  generatingText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textStrong,
    paddingRight: 20,
  },
  bodyInput: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textStrong,
    paddingRight: 20,
    textAlignVertical: 'top',
    minHeight: 140,
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
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tonePillActive: {
    backgroundColor: '#FFF7ED',
    borderColor: colors.primary,
  },
  tonePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textBody,
  },
  tonePillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tonePillMore: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  submitButtonsWrapper: {
    gap: 10,
    marginTop: 8,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 24,
  },
  sendBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  saveDraftBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 24,
  },
  saveDraftBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
