import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  title: string;
  hint: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export function EmptyState({ title, hint, ctaLabel, onCta }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {ctaLabel && onCta ? (
        <Pressable onPress={onCta} style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  cta: {
    minHeight: 44,
    marginTop: spacing.md,
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.ink, fontWeight: '900' },
});
