export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textPrimary: string;
  muted: string;
  textSecondary: string;
  gold: string;
  accent: string;
  ink: string;
  onAccent: string;
  accentMuted: string;
  danger: string;
  error: string;
  success: string;
};

export const darkTheme: ThemeColors = {
  background: '#11100d',
  surface: '#1d1a15',
  surfaceMuted: '#29241b',
  border: '#4b402d',
  text: '#f4efe3',
  textPrimary: '#f4efe3',
  muted: '#c4b9a4',
  textSecondary: '#c4b9a4',
  gold: '#c9a75b',
  accent: '#c9a75b',
  ink: '#17130d',
  onAccent: '#17130d',
  accentMuted: '#332811',
  danger: '#e77b69',
  error: '#e77b69',
  success: '#7dba7a',
};

export const lightTheme: ThemeColors = {
  background: '#f4efe6',
  surface: '#fbf8f1',
  surfaceMuted: '#ebe4d6',
  border: '#d4c9b3',
  text: '#1c1812',
  textPrimary: '#1c1812',
  muted: '#6f675a',
  textSecondary: '#6f675a',
  gold: '#b0893a',
  accent: '#b0893a',
  ink: '#17130d',
  onAccent: '#17130d',
  accentMuted: '#f0e4c4',
  danger: '#c45c4a',
  error: '#c45c4a',
  success: '#3d7a4a',
};

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

export function withAlpha(hex: string, opacity: number) {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map((ch) => ch + ch).join('')
    : raw;
  const n = parseInt(normalized, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function themeFor(scheme: ColorScheme): ThemeColors {
  return scheme === 'light' ? lightTheme : darkTheme;
}
