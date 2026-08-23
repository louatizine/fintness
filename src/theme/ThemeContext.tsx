import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themeFor, type ColorScheme, type ThemeColors, type ThemePreference } from './colors';

const THEME_KEY = 'ironlog.theme';

type ThemeContextValue = {
  colors: ThemeColors;
  preference: ThemePreference;
  resolved: ColorScheme;
  setPreference: (pref: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function parsePreference(value: string | null): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

function applyNativeScheme(preference: ThemePreference) {
  if (typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        const next = parsePreference(saved);
        setPreferenceState(next);
        applyNativeScheme(next);
      })
      .catch(() => {});
  }, []);

  const resolved: ColorScheme = preference === 'system'
    ? (system === 'light' ? 'light' : 'dark')
    : preference;

  const colors = themeFor(resolved);

  const setPreference = useCallback(async (pref: ThemePreference) => {
    setPreferenceState(pref);
    applyNativeScheme(pref);
    await AsyncStorage.setItem(THEME_KEY, pref);
  }, []);

  const value = useMemo(
    () => ({ colors, preference, resolved, setPreference }),
    [colors, preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
