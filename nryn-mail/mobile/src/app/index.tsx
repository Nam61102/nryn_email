import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { Button, ErrorNote, Loading } from '../ui/components';

const FEATURES: { icon: keyof typeof Feather.glyphMap; text: string }[] = [
  { icon: 'eye', text: 'Reads every email as it arrives' },
  { icon: 'check-square', text: 'Surfaces only the ones that need you' },
  { icon: 'send', text: 'Drafts the reply — you approve and send' },
];

export default function Connect() {
  const { me, loading, signingIn, error, signIn } = useAuth();

  // Already connected? Go straight to the inbox.
  useEffect(() => {
    if (!loading && me) router.replace('/inbox');
  }, [loading, me]);

  if (loading) return <Loading label="Starting NRYN Mail…" />;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.hero}>
        <View style={s.mark}>
          <Feather name="mail" size={34} color={colors.white} />
        </View>
        <Text style={s.title}>NRYN Mail</Text>
        <Text style={s.tagline}>Your inbox, already read. You only see what actually needs you.</Text>
      </View>

      <View style={s.features}>
        {FEATURES.map((f) => (
          <View key={f.text} style={s.featureRow}>
            <View style={s.featureIcon}>
              <Feather name={f.icon} size={17} color={colors.primaryDark} />
            </View>
            <Text style={s.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={{ marginBottom: 14 }}>
          <ErrorNote title={error.title} detail={error.detail} hint={error.hint} />
        </View>
      ) : null}

      <Button
        label={signingIn ? 'Opening Google…' : 'Connect Gmail'}
        icon="mail"
        loading={signingIn}
        onPress={signIn}
        style={{ minHeight: 54, borderRadius: 16 }}
      />

      <Text style={s.footnote}>
        Read-only access to start. Nothing is ever sent without your approval.
      </Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingBottom: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  mark: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 14, fontSize: 34, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  tagline: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 270,
  },
  features: { gap: 14, marginBottom: 26 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: 14, color: colors.textBody },
  footnote: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
