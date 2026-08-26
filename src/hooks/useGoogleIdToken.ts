import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_PACKAGE = 'com.zineeddine.ironlog';

function reversedGoogleScheme(clientId?: string) {
  if (!clientId?.endsWith('.apps.googleusercontent.com')) return undefined;
  return clientId.split('.').reverse().join('.');
}

export function googleClientIds() {
  return {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  };
}

export function isGoogleAuthConfigured() {
  const ids = googleClientIds();
  return Boolean(Platform.select({
    ios: ids.iosClientId,
    android: ids.androidClientId,
    default: ids.webClientId,
  }));
}

function nativeRedirectUri() {
  if (Platform.OS === 'ios') {
    const reversed = reversedGoogleScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
    if (reversed) return `${reversed}:/oauthredirect`;
  }
  if (Platform.OS === 'android') {
    const reversed = reversedGoogleScheme(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
    if (reversed) return `${reversed}:/oauthredirect`;
    return `${ANDROID_PACKAGE}:/oauthredirect`;
  }
  return 'ironlog:/oauthredirect';
}

type Options = {
  language?: string;
  onIdToken: (idToken: string) => void;
  onError: (message?: string) => void;
};

export function useGoogleIdToken({ language, onIdToken, onError }: Options) {
  const ids = googleClientIds();
  const native = useMemo(() => nativeRedirectUri(), []);
  const handled = useRef<string | null>(null);
  const onIdTokenRef = useRef(onIdToken);
  const onErrorRef = useRef(onError);
  onIdTokenRef.current = onIdToken;
  onErrorRef.current = onError;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: ids.iosClientId,
      androidClientId: ids.androidClientId,
      webClientId: ids.webClientId,
      selectAccount: true,
      language,
    },
    { scheme: 'ironlog', path: 'oauthredirect', native }
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  useEffect(() => {
    if (response?.type === 'error') {
      onErrorRef.current(response.error?.message);
      return;
    }
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token || response.authentication?.idToken || '';
    if (!idToken || handled.current === idToken) return;
    handled.current = idToken;
    onIdTokenRef.current(idToken);
  }, [response]);

  return {
    ready: Boolean(request),
    prompt: () => promptAsync(),
  };
}
