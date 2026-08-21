import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { programs as programsApi } from '../services/api';
import { ExerciseHowToModal, ExerciseThumb, HowToButton } from '../components/ExerciseHowTo';
import { colors, radius, spacing } from '../theme';
import { apiErrorMessage } from '../../i18n';
import type { Exercise, Program, ProgramDay, ProgramExercise, ProgramType } from '../types/models';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function dayPreview(program: Program) {
  return program.days.map((day) => day.dayLabel).join(' · ');
}

function typeLabel(type: ProgramType, t: (key: string) => string) {
  const keys: Record<ProgramType, string> = {
    upper_lower: 'programs.upperLower',
    push_pull_legs: 'programs.pushPullLegs',
    full_body: 'programs.fullBody',
    home_bodyweight: 'programs.home',
    custom: 'programs.custom',
  };
  return t(keys[type]);
}

export function ProgramPicker({
  library,
  activeProgramId,
  onClose,
  onChanged,
}: {
  library: Exercise[];
  activeProgramId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<ProgramDay[]>([{ dayLabel: '', exercises: [] }]);
  const [editingDay, setEditingDay] = useState(0);
  const [bodyweightOnly, setBodyweightOnly] = useState(false);
  const [howTo, setHowTo] = useState<Exercise | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await programsApi.getAll());
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function assign(programId: string) {
    setSaving(true);
    setError('');
    try {
      await programsApi.assign(programId);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.assignFailed')));
    } finally {
      setSaving(false);
    }
  }

  async function trainFree() {
    setSaving(true);
    setError('');
    try {
      await programsApi.unassign();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.clearFailed')));
    } finally {
      setSaving(false);
    }
  }

  function patchDay(index: number, patch: Partial<ProgramDay>) {
    setDays((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }

  function addExercise(exercise: Exercise) {
    const slot: ProgramExercise = {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      targetSets: exercise.targetSets ?? 3,
      targetRepMin: exercise.targetRepMin ?? 8,
      targetRepMax: exercise.targetRepMax ?? 12,
    };
    setDays((current) => current.map((day, i) => {
      if (i !== editingDay || day.exercises.some((item) => item.exerciseId === exercise.id)) return day;
      return { ...day, exercises: [...day.exercises, slot] };
    }));
  }

  function removeExercise(exerciseId: string) {
    setDays((current) => current.map((day, i) => (
      i === editingDay ? { ...day, exercises: day.exercises.filter((item) => item.exerciseId !== exerciseId) } : day
    )));
  }

  async function saveCustom() {
    if (!name.trim()) {
      setError(t('programs.nameRequired'));
      return;
    }
    if (days.some((day) => day.exercises.length === 0)) {
      setError(t('programs.dayNeedsExercises'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await programsApi.create({
        name: name.trim(),
        description: description.trim(),
        type: 'custom',
        daysPerWeek: days.length,
        days: days.map((day, index) => ({
          dayLabel: day.dayLabel.trim() || t('programs.dayN', { n: index + 1 }),
          exercises: day.exercises.map(({ exerciseId, targetSets, targetRepMin, targetRepMax }) => ({
            exerciseId, targetSets, targetRepMin, targetRepMax,
          })),
        })),
      });
      await programsApi.assign(created.id);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  const picker = library.filter((exercise) => {
    const day = days[editingDay];
    if (day?.exercises.some((item) => item.exerciseId === exercise.id)) return false;
    if (bodyweightOnly && exercise.equipment !== 'bodyweight' && exercise.equipment !== 'none') return false;
    if (bodyweightOnly && exercise.type !== 'strength') return false;
    return true;
  });

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.gold} /></View>;
  }

  if (building) {
    const current = days[editingDay];
    return (
      <View>
        <Text style={styles.kicker}>{t('programs.customKicker')}</Text>
        <Text style={styles.title}>{t('programs.buildTitle')}</Text>
        <Text style={styles.label}>{t('programs.name')}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={t('programs.namePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={styles.label}>{t('programs.description')}</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder={t('programs.descriptionPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
        <View style={styles.chipRow}>
          {days.map((day, index) => (
            <Chip key={`${day.dayLabel}-${index}`} label={day.dayLabel || t('programs.dayN', { n: index + 1 })} active={editingDay === index} onPress={() => setEditingDay(index)} />
          ))}
          <Pressable
            onPress={() => {
              setDays((currentDays) => [...currentDays, { dayLabel: t('programs.dayN', { n: currentDays.length + 1 }), exercises: [] }]);
              setEditingDay(days.length);
            }}
            style={styles.addDay}
          >
            <Text style={styles.addDayText}>{t('programs.addDay')}</Text>
          </Pressable>
        </View>
        {current ? (
          <>
            <Text style={styles.label}>{t('programs.dayLabel')}</Text>
            <TextInput value={current.dayLabel} onChangeText={(dayLabel) => patchDay(editingDay, { dayLabel })} placeholder={t('programs.dayN', { n: editingDay + 1 })} placeholderTextColor={colors.muted} style={styles.input} />
            {days.length > 1 ? (
              <Pressable onPress={() => {
                setDays((currentDays) => currentDays.filter((_, i) => i !== editingDay));
                setEditingDay((index) => Math.max(0, index - 1));
              }} style={styles.textButton}>
                <Text style={styles.removeDay}>{t('programs.removeDay')}</Text>
              </Pressable>
            ) : null}
            {current.exercises.map((item) => (
              <View key={item.exerciseId} style={styles.slot}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotName}>{item.exerciseName || item.exerciseId}</Text>
                  <Text style={styles.slotMeta}>{item.targetSets} × {item.targetRepMin}–{item.targetRepMax}</Text>
                </View>
                <Pressable onPress={() => removeExercise(item.exerciseId)} style={styles.iconHit}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            <View style={styles.libraryHeader}>
              <Text style={styles.label}>{t('programs.addExercise')}</Text>
              <Chip label={t('programs.bodyweightOnly')} active={bodyweightOnly} onPress={() => setBodyweightOnly((value) => !value)} />
            </View>
            {picker.map((exercise) => (
              <View key={exercise.id} style={styles.libraryRow}>
                <ExerciseThumb uri={exercise.referenceImageUrl} />
                <Pressable onPress={() => addExercise(exercise)} style={styles.libraryMain}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotName}>{exercise.name}</Text>
                    <Text style={styles.slotMeta}>
                      {exercise.type === 'cardio' ? t('today.cardio') : t('today.strength')}
                      {' · '}
                      {exercise.muscleGroup ? t(`muscles.${exercise.muscleGroup}`, { defaultValue: exercise.muscleGroup }) : t('today.untagged')}
                      {' · '}
                      {t(`equipment.${exercise.equipment}`, { defaultValue: exercise.equipment })}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.gold} />
                </Pressable>
                <HowToButton onPress={() => setHowTo(exercise)} />
              </View>
            ))}
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void saveCustom()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color={colors.accentDark} /> : <Text style={styles.primaryText} numberOfLines={2}>{t('programs.saveAndAssign')}</Text>}
        </Pressable>
        <Pressable onPress={() => setBuilding(false)} style={styles.textButton}><Text style={styles.textButtonLabel}>{t('programs.backToPrograms')}</Text></Pressable>
        <ExerciseHowToModal exercise={howTo} onClose={() => setHowTo(null)} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.kicker}>{t('programs.kicker')}</Text>
      <Text style={styles.title}>{t('programs.title')}</Text>
      <Text style={styles.help}>{t('programs.help')}</Text>
      {list.map((program) => {
        const active = program.id === activeProgramId;
        return (
          <View key={program.id} style={styles.card}>
            <Text style={styles.kicker}>{typeLabel(program.type, t)}{program.isCustom ? ` · ${t('programs.yours')}` : ''}</Text>
            <Text style={styles.cardTitle}>{program.name}</Text>
            <Text style={styles.help}>{program.description}</Text>
            <Text style={styles.slotMeta}>{t('programs.daysPreview', { n: program.daysPerWeek, preview: dayPreview(program) })}</Text>
            <Pressable
              onPress={() => void assign(program.id)}
              disabled={saving || active}
              style={[styles.primary, (saving || active) && styles.disabled]}
            >
              <Text style={styles.primaryText}>{active ? t('programs.assigned') : t('programs.assign')}</Text>
            </Pressable>
          </View>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => setBuilding(true)} style={styles.secondary}>
        <Ionicons name="add" size={18} color={colors.gold} />
        <Text style={styles.secondaryText}>{t('programs.buildCustom')}</Text>
      </Pressable>
      {activeProgramId ? (
        <Pressable onPress={() => void trainFree()} disabled={saving} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{t('programs.trainFree')}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onClose} style={styles.textButton}><Text style={styles.textButtonLabel}>{t('programs.backToToday')}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 6, marginBottom: spacing.sm },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4, marginBottom: 6 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12, fontSize: 15, borderRadius: radius.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  chip: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: colors.ink },
  addDay: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gold, justifyContent: 'center' },
  addDayText: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  removeDay: { color: colors.danger, fontWeight: '700' },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  slotName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  slotMeta: { color: colors.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  libraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, gap: 8, flexWrap: 'wrap' },
  libraryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, paddingStart: spacing.sm, paddingEnd: spacing.xs, marginTop: spacing.sm, gap: 8 },
  libraryMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 44 },
  primary: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: colors.accentDark, fontWeight: '900', textAlign: 'center' },
  secondary: { marginTop: spacing.md, borderColor: colors.gold, borderWidth: 1, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  secondaryText: { color: colors.gold, fontWeight: '800' },
  textButton: { alignItems: 'center', marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { color: colors.muted, fontWeight: '700', textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  disabled: { opacity: 0.65 },
  iconHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
