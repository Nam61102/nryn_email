import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authApi, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { Button, ErrorNote, Loading } from '../ui/components';

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const exchangingRef = useRef(false);

  useEffect(() => {
    async function completeAuth() {
      if (exchangingRef.current) return;
      exchangingRef.current = true;

      const code = params.code ? String(params.code) : '';
      const returnedError = params.error ? String(params.error) : '';

      if (returnedError) {
        setError(`Google sign-in error: ${returnedError}`);
        return;
      }

      if (!code) {
        setError('No authorization code was received.');
        return;
      }

      try {
        const { token } = await authApi.exchange(code);
        await tokenStore.set(token);

        // If in a popup, notify parent and close
        if (typeof window !== 'undefined') {
          try {
            const bc = new BroadcastChannel('nryn_mail_auth');
            bc.postMessage({ type: 'AUTH_SUCCESS', token });
            bc.close();
          } catch {}

          if (window.opener) {
            try {
              window.close();
              return;
            } catch {}
          }
        }

        await refresh();
        router.replace('/inbox');
      } catch (err: any) {
        setError(err?.message || 'Failed to exchange authorization code.');
      }
    }

    completeAuth();
  }, [params.code, params.error, refresh]);

  if (error) {
    return (
      <SafeAreaView style={s.center}>
        <View style={{ width: '100%', maxWidth: 360 }}>
          <ErrorNote
            title="Sign-in failed"
            detail={error}
            hint="Please return to the main screen and try signing in again."
          />
          <View style={{ marginTop: 20 }}>
            <Button label="Back to Sign In" onPress={() => router.replace('/')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return <Loading label="Connecting your account…" />;
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
