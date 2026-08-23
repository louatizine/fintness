import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { Exercise } from '../types/models';

export function ExerciseThumb({ uri, size = 44 }: { uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, { width: size, height: size }]}>
        <Ionicons name="barbell-outline" size={Math.round(size * 0.45)} color={colors.muted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={[styles.thumb, { width: size, height: size }]}
    />
  );
}

export function HowToButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.howTo} accessibilityLabel={t('exerciseHowTo.accessibility')}>
      <Ionicons name="help-circle-outline" size={22} color={colors.gold} />
    </Pressable>
  );
}

export function ExerciseHowToModal({
  exercise,
  onClose,
}: {
  exercise: Exercise | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [exercise?.id, exercise?.referenceImageUrl]);
  if (!exercise) return null;

  const imageUrl = exercise.referenceImageUrl;
  const steps = exercise.referenceInstructions ?? [];
  const custom = exercise.isCustom && !imageUrl;
  const muscle = exercise.muscleGroup
    ? t(`muscles.${exercise.muscleGroup}`, { defaultValue: exercise.muscleGroup })
    : t('exerciseHowTo.untagged');
  const equipment = t(`equipment.${exercise.equipment}`, { defaultValue: exercise.equipment });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.kicker}>{t('exerciseHowTo.howTo')}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('exerciseHowTo.close')} style={styles.closeHit}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {imageUrl && !failed ? (
              <Image
                source={{ uri: imageUrl }}
                onError={() => setFailed(true)}
                style={styles.hero}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons name="barbell-outline" size={42} color={colors.muted} />
                <Text style={styles.placeholderNote}>
                  {custom ? t('exerciseHowTo.customNoDemo') : t('exerciseHowTo.noImage')}
                </Text>
              </View>
            )}
            <Text style={styles.title}>{exercise.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>{t('exerciseHowTo.target')}</Text>
                <Text style={styles.metaValue}>{muscle}</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>{t('exerciseHowTo.equipment')}</Text>
                <Text style={styles.metaValue}>{equipment}</Text>
              </View>
            </View>
            {steps.length ? (
              <>
                <Text style={styles.stepsLabel}>{t('exerciseHowTo.steps')}</Text>
                {steps.map((step, index) => (
                  <View key={`${index}-${step.slice(0, 16)}`} style={styles.stepRow}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.emptySteps}>{t('exerciseHowTo.noSteps')}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    thumb: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    howTo: { minWidth: 44, minHeight: 44, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    backdrop: { flex: 1 },
    sheet: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopStartRadius: 16,
      borderTopEndRadius: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    closeHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    sheetBody: { padding: spacing.md, paddingBottom: 40 },
    kicker: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
    hero: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
    heroPlaceholder: {
      width: '100%',
      aspectRatio: 1.6,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    placeholderNote: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
    title: { color: colors.text, fontSize: 24, fontWeight: '800' },
    metaRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    metaChip: { flex: 1, backgroundColor: colors.accentMuted, borderRadius: radius.sm, padding: spacing.sm },
    metaLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    metaValue: { color: colors.text, fontWeight: '800', marginTop: 4, textTransform: 'capitalize' },
    stepsLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
    stepRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
    stepIndex: { color: colors.gold, fontWeight: '900', width: 18, marginTop: 1 },
    stepText: { color: colors.text, flex: 1, lineHeight: 20, fontSize: 14 },
    emptySteps: { color: colors.muted, marginTop: spacing.md, lineHeight: 20, fontSize: 14 },
  });
}
