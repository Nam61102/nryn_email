import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ApiError, authApi, tokenStore } from './api';
import type { Me } from './types';

WebBrowser.maybeCompleteAuthSession();

interface AuthValue {
  me: Me | null;
  loading: boolean;
  signingIn: boolean;
  error: { title: string; detail?: string; hint?: string } | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<AuthValue['error']>(null);

  const refresh = useCallback(async () => {
    const token = await tokenStore.get();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      setMe(await authApi.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await tokenStore.clear();
        setMe(null);
      } else if (err instanceof ApiError && err.status === 0) {
        setError({ title: 'Backend unreachable', detail: err.message, hint: err.hint });
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'nryn_mail_token' && e.newValue) {
        refresh();
      }
    };
    window.addEventListener('storage', handleStorage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('nryn_mail_auth');
      bc.onmessage = (event) => {
        if (event.data?.type === 'AUTH_SUCCESS') {
          refresh();
        }
      };
    } catch {}

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [refresh]);

  /**
   * The full mobile OAuth hand-off:
   *
   *   1. Build the redirect URI Expo owns for this build.
   *      Expo Go   -> exp://192.168.x.x:8081/--/auth
   *      Standalone-> nrynmail://auth
   *   2. Ask the backend for Google's consent URL, telling it where to send us.
   *   3. Open a system auth browser. It closes itself the moment Google (via our
   *      backend) redirects to that URI, and hands us the final URL.
   *   4. That URL carries a ONE-TIME code, not a token. Trade it over POST.
   */
  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      const redirectUri = Linking.createURL('auth');
      const { url } = await authApi.connectUrl(redirectUri);

      // On web, direct page navigation avoids popup blockers and Cross-Origin-Opener-Policy issues entirely.
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.location.href = url;
          return;
        }
      }

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setSigningIn(false);
        return;
      }
      if (result.type !== 'success' || !result.url) {
        setError({ title: 'Sign-in did not complete', detail: 'The browser closed unexpectedly.' });
        setSigningIn(false);
        return;
      }

      const { queryParams } = Linking.parse(result.url);
      const returnedError = queryParams?.error ? String(queryParams.error) : '';
      const code = queryParams?.code ? String(queryParams.code) : '';

      if (returnedError) {
        setError({ title: 'Sign-in did not complete', detail: describeAuthError(returnedError) });
        setSigningIn(false);
        return;
      }
      if (!code) {
        setError({ title: 'Sign-in did not complete', detail: 'No code came back from Google.' });
        setSigningIn(false);
        return;
      }

      const { token } = await authApi.exchange(code);
      await tokenStore.set(token);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title:
            err.code === 'google_oauth_not_configured'
              ? 'Google OAuth is not set up yet'
              : err.code === 'redirect_not_allowed'
                ? 'Deep link not allowed by the backend'
                : 'Could not sign in',
          detail: err.message,
          hint: err.hint,
        });
      } else {
        setError({ title: 'Could not sign in' });
      }
    } finally {
      setSigningIn(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await authApi.disconnect();
    } catch {
      // Disconnecting locally still matters even if the server call failed.
    }
    await tokenStore.clear();
    setMe(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading,
      signingIn,
      error,
      signIn,
      signOut,
      refresh,
      clearError: () => setError(null),
    }),
    [me, loading, signingIn, error, signIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function describeAuthError(code: string) {
  const map: Record<string, string> = {
    bad_state: 'That sign-in attempt expired. Try again.',
    missing_code: 'Google did not return an authorisation code.',
    exchange_failed: 'Google rejected the token exchange. Check the client ID and secret.',
    access_denied: 'You declined the permission request.',
  };
  return map[code] || code;
}
