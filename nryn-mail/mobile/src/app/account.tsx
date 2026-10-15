import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { Button, Chip, ErrorNote, formatWhen } from '../ui/components';
import { BottomNav } from '../ui/BottomNav';

export default function Account() {
  const { me, signOut, addAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  const account = me?.account;
  const accounts = me?.accounts && me.accounts.length > 0 ? me.accounts : (account ? [account] : []);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back} hitSlop={10}>
          <Feather name="chevron-left" size={20} color={colors.primary} />
          <Text style={s.backText}>Inbox</Text>
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.title}>Account</Text>

        <View style={s.card}>
          <View style={s.identity}>
            <View style={s.mark}>
              <Feather name="user" size={19} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{me?.user.displayName || 'You'}</Text>
              <Text style={s.email} numberOfLines={1}>
                {me?.user.email}
              </Text>
            </View>
          </View>
        </View>

        {/* Connected Email Accounts Section */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={s.sectionTitle}>CONNECTED EMAIL ACCOUNTS ({accounts.length})</Text>
            <Pressable
              onPress={() => addAccount()}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5 }, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Feather name="plus-circle" size={15} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Add Account</Text>
            </Pressable>
          </View>

          {accounts.map((acc, index) => (
            <View
              key={acc.id || index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: colors.borderSoft,
              }}
            >
              <View style={[s.mark, { width: 34, height: 34, borderRadius: 17 }]}>
                <Feather name="mail" size={16} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                  {acc.emailAddress}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip tone={acc.status === 'active' ? 'success' : 'urgent'}>
                    {acc.status === 'active' ? 'Gmail connected' : 'Reauth required'}
                  </Chip>
                  {acc.canSend ? <Chip tone="primary">Send enabled</Chip> : null}
                  {acc.lastSyncedAt ? (
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      Synced {formatWhen(acc.lastSyncedAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>

        {account?.status === 'reauth_required' ? (
          <ErrorNote
            title="Reconnect Gmail"
            detail="Google access was revoked or has expired, so syncing has stopped."
            hint="Disconnect below, then connect again to grant fresh access."
          />
        ) : null}

        {account?.lastError ? (
          <View style={s.warn}>
            <Feather name="alert-triangle" size={17} color={colors.action} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.warnLabel}>LAST SYNC ERROR</Text>
              <Text style={s.warnText}>{account.lastError}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', gap: 11 }}>
            <Feather name="shield" size={18} color={colors.primaryDark} style={{ marginTop: 1 }} />
            <Text style={s.security}>
              Your Gmail tokens are encrypted at rest on the server and never reach this phone. Your
              session token is kept in the device keychain. NRYN Mail reads your inbox and sends only
              the replies you approve.
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.metaLabel}>CONNECTED TO</Text>
          <Text style={s.metaValue}>{API_URL}</Text>
          <Text style={s.metaHint}>
            Set by EXPO_PUBLIC_API_URL in mobile/.env. If requests fail, this is the first thing to
            check — it must be your computer&apos;s LAN IP, not localhost.
          </Text>
        </View>

        <Button
          label={busy ? 'Disconnecting…' : 'Disconnect Gmail'}
          variant="ghost"
          icon="log-out"
          disabled={busy}
          onPress={disconnect}
        />
      </ScrollView>

      <BottomNav activeTab="profile" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '600', color: colors.primary },

  body: { padding: 18, paddingBottom: 40, gap: 16 },
  title: { fontSize: 25, fontWeight: '700', color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  email: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  warn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.actionTint,
    borderWidth: 1,
    borderColor: colors.actionBorder,
    borderRadius: 16,
    padding: 14,
  },
  warnLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.actionText },
  warnText: { fontSize: 13, lineHeight: 19, color: '#713F12' },

  security: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.textBody },

  metaLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: colors.textMuted },
  metaValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  metaHint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
});
