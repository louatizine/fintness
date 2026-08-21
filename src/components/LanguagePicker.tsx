import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  changeAppLanguage,
  currentLanguage,
  type AppLanguage,
} from '../../i18n';
import { colors, radius, spacing } from '../theme';

type Props = { compact?: boolean };

export function LanguagePicker({ compact = false }: Props) {
  const { t, i18n } = useTranslation();
  const active = currentLanguage();

  async function select(lang: AppLanguage) {
    if (lang === active) return;
    await changeAppLanguage(lang);
  }

  return (
    <View>
      {compact ? null : <Text style={styles.section}>{t('settings.language')}</Text>}
      <View style={[styles.row, compact && styles.compactRow]}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const selected = (i18n.language ?? active).startsWith(lang);
          return (
            <Pressable
              key={lang}
              onPress={() => void select(lang)}
              style={[styles.chip, selected && styles.chipActive, compact && styles.compactChip]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={LANGUAGE_NATIVE_NAMES[lang]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]} numberOfLines={1}>
                {LANGUAGE_NATIVE_NAMES[lang]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  compactRow: { justifyContent: 'center', marginTop: spacing.md },
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
  compactChip: { flex: 1 },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  chipTextActive: { color: colors.ink },
});
