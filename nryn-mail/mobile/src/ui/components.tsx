import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';

import { colors, priorityMeta, type PriorityKey } from '../lib/theme';

export function Avatar({
  name,
  tone = 'neutral',
  size = 36,
}: {
  name: string;
  tone?: 'urgent' | 'action' | 'neutral';
  size?: number;
}) {
  const initials =
    (name || '?')
      .replace(/[<>@].*$/, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';

  const palette =
    tone === 'urgent'
      ? { bg: colors.urgentAvatar, fg: colors.urgentText }
      : tone === 'action'
        ? { bg: colors.actionAvatar, fg: colors.actionText }
        : { bg: colors.primaryTint, fg: colors.primaryDark };

  return (
    <View
      style={[
        s.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}
    >
      <Text style={{ color: palette.fg, fontSize: size * 0.35, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityKey }) {
  const meta = priorityMeta[priority];
  return (
    <View style={[s.badge, { backgroundColor: meta.bg }]}>
      <Text style={[s.badgeText, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'urgent' | 'primary' | 'success';
  icon?: keyof typeof Feather.glyphMap;
}) {
  const map = {
    neutral: { bg: colors.chip, fg: colors.textBody },
    urgent: { bg: colors.urgentTint, fg: colors.urgentText },
    primary: { bg: colors.primaryTint, fg: colors.primaryDark },
    success: { bg: colors.successTint, fg: colors.success },
  } as const;
  const c = map[tone];
  return (
    <View style={[s.chip, { backgroundColor: c.bg }]}>
      {icon ? <Feather name={icon} size={12} color={c.fg} /> : null}
      <Text style={[s.chipText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{children}</Text>
      {right ? <Text style={s.sectionRight}>{right}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const skins = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    outline: { bg: colors.surface, fg: colors.primaryDark, border: colors.primaryBorder },
    ghost: { bg: colors.surface, fg: colors.textBody, border: colors.border },
  } as const;
  const skin = skins[variant];
  const off = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: skin.bg,
          borderColor: skin.border,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={skin.fg} />
      ) : icon ? (
        <Feather name={icon} size={17} color={skin.fg} />
      ) : null}
      <Text style={[s.buttonText, { color: skin.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function InsightCard({
  insight,
  needsReply,
  deadlineAt,
}: {
  insight: string;
  needsReply?: boolean;
  deadlineAt?: string | null;
}) {
  return (
    <View style={s.insight}>
      <View style={s.insightHead}>
        <Feather name="zap" size={14} color={colors.primaryDark} />
        <Text style={s.insightLabel}>NRYN INSIGHT</Text>
      </View>
      <Text style={s.insightText}>{insight}</Text>
      {needsReply || deadlineAt ? (
        <View style={s.chipRow}>
          {needsReply ? <Chip tone="primary">Needs your reply</Chip> : null}
          {deadlineAt ? <Chip tone="urgent">Due {formatDate(deadlineAt)}</Chip> : null}
        </View>
      ) : null}
    </View>
  );
}

export function ErrorNote({
  title,
  detail,
  hint,
}: {
  title: string;
  detail?: string;
  hint?: string;
}) {
  return (
    <View style={s.errorNote}>
      <Text style={s.errorTitle}>{title}</Text>
      {detail ? <Text style={s.errorDetail}>{detail}</Text> : null}
      {hint ? <Text style={s.errorHint}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={s.loadingText}>{label}</Text> : null}
    </View>
  );
}

export function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <View style={s.toast}>
      <Feather name="bell" size={16} color={colors.white} />
      <Text style={s.toastText} numberOfLines={3}>
        {text}
      </Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
        <Feather name="x" size={16} color="rgba(255,255,255,0.75)" />
      </Pressable>
    </View>
  );
}

export function formatDate(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatWhen(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatBytes(n: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function avatarToneFor(p: string | null): 'urgent' | 'action' | 'neutral' {
  if (p === 'urgent') return 'urgent';
  if (p === 'action_required') return 'action';
  return 'neutral';
}

const s = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: colors.textMuted },
  sectionRight: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  button: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 14.5, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
  },
  insight: {
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 18,
    padding: 15,
    gap: 9,
  },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  insightLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: colors.primaryDark },
  insightText: { fontSize: 15, fontWeight: '500', lineHeight: 22, color: '#1E1B4B' },
  errorNote: {
    backgroundColor: colors.urgentTint,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 14,
    gap: 5,
  },
  errorTitle: { fontSize: 13.5, fontWeight: '700', color: colors.urgentText },
  errorDetail: { fontSize: 13, lineHeight: 19, color: colors.textBody },
  errorHint: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    backgroundColor: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastText: { flex: 1, color: colors.white, fontSize: 13, lineHeight: 19 },
});
