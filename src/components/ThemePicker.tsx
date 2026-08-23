import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors, type ThemePreference, THEME_PREFERENCES } from '../theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

export function ThemePicker() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View>
      <Text style={styles.section}>{t('settings.appearance')}</Text>
      <View style={styles.row}>
        {THEME_PREFERENCES.map((id) => {
          const selected = preference === id;
          return (
            <Pressable
              key={id}
              onPress={() => void setPreference(id)}
              style={[styles.chip, selected && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(LABELS[id])}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]} numberOfLines={1}>
                {t(LABELS[id])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
    chip: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    chipText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
    chipTextActive: { color: colors.ink },
  });
}
