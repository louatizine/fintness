import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { exercises as exercisesApi, programs as programsApi } from '../../services/api';
import { ExerciseHowToModal, ExerciseThumb, HowToButton } from '../../components/ExerciseHowTo';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { Exercise, Program, ProgramDay, ProgramExercise } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow, CoachChip } from './coachUi';

export function AssignCoachProgramScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<CoachesStackParamList, 'AssignCoachProgram'>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<ProgramDay[]>([{ dayLabel: '', exercises: [] }]);
  const [editingDay, setEditingDay] = useState(0);
  const [bodyweightOnly, setBodyweightOnly] = useState(false);
  const [howTo, setHowTo] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const programId = route.params.programId;

  const load = useCallback(async () => {
    try {
      const [library, all] = await Promise.all([
        exercisesApi.getAll(),
        programId ? programsApi.getAll() : Promise.resolve([] as Program[]),
      ]);
      setLibrary(library);
      const program = programId ? all.find((item) => item.id === programId) : undefined;
      if (program) {
        setName(program.name);
        setDescription(program.description);
        setDays(program.days.length
          ? program.days.map((day) => ({
            dayLabel: day.dayLabel,
            exercises: day.exercises.map((item) => ({
              exerciseId: item.exerciseId,
              exerciseName: item.exerciseName,
              targetSets: item.targetSets,
              targetRepMin: item.targetRepMin,
              targetRepMax: item.targetRepMax,
            })),
          }))
          : [{ dayLabel: '', exercises: [] }]);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [programId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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

  async function save() {
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
    setInfo('');
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        type: 'custom' as const,
        daysPerWeek: days.length,
        days: days.map((day, index) => ({
          dayLabel: day.dayLabel.trim() || t('programs.dayN', { n: index + 1 }),
          exercises: day.exercises.map(({ exerciseId, targetSets, targetRepMin, targetRepMax }) => ({
            exerciseId, targetSets, targetRepMin, targetRepMax,
          })),
        })),
      };
      if (programId) {
        await programsApi.update(programId, payload);
        setInfo(t('coaches.planUpdated', { name: route.params.athleteLabel }));
      } else {
        await programsApi.create({ ...payload, assignedToUserId: route.params.athleteId });
        setInfo(t('coaches.planAssigned', { name: route.params.athleteLabel }));
      }
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
  const current = days[editingDay];

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.assignEyebrow')}</Text>
      <Text style={styles.title}>{programId ? t('coaches.editPlan') : t('coaches.assignPlan')}</Text>
      <Text style={styles.help}>{t('coaches.assignHelp', { name: route.params.athleteLabel })}</Text>
      <Text style={styles.label}>{t('programs.name')}</Text>
      <TextInput value={name} onChangeText={setName} placeholder={t('programs.namePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('programs.description')}</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder={t('programs.descriptionPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.chipRow}>
        {days.map((day, index) => (
          <CoachChip key={`${day.dayLabel}-${index}`} label={day.dayLabel || t('programs.dayN', { n: index + 1 })} active={editingDay === index} onPress={() => setEditingDay(index)} />
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
          {current.exercises.map((item) => (
            <View key={item.exerciseId} style={styles.slot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotName}>{item.exerciseName || item.exerciseId}</Text>
                <Text style={styles.slotMeta}>{item.targetSets} × {item.targetRepMin}–{item.targetRepMax}</Text>
              </View>
              <Pressable onPress={() => setDays((currentDays) => currentDays.map((day, i) => i === editingDay ? { ...day, exercises: day.exercises.filter((row) => row.exerciseId !== item.exerciseId) } : day))} style={styles.iconHit}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.libraryHeader}>
            <Text style={styles.label}>{t('programs.addExercise')}</Text>
            <CoachChip label={t('programs.bodyweightOnly')} active={bodyweightOnly} onPress={() => setBodyweightOnly((value) => !value)} />
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
      {info ? <Text style={styles.message}>{info}</Text> : null}
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{programId ? t('coaches.savePlan') : t('coaches.saveAndAssign')}</Text>}
      </Pressable>
      <ExerciseHowToModal exercise={howTo} onClose={() => setHowTo(null)} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
    title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 6 },
    help: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12, fontSize: 15, borderRadius: radius.sm },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
    addDay: { minHeight: 40, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gold, justifyContent: 'center' },
    addDayText: { color: colors.gold, fontSize: 12, fontWeight: '800' },
    slot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
    slotName: { color: colors.text, fontWeight: '800', fontSize: 16 },
    slotMeta: { color: colors.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
    libraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, gap: 8, flexWrap: 'wrap' },
    libraryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, paddingStart: spacing.sm, paddingEnd: spacing.xs, marginTop: spacing.sm, gap: 8 },
    libraryMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 44 },
    iconHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    primary: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    primaryText: { color: colors.ink, fontWeight: '900', textAlign: 'center' },
    error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
    message: { color: colors.success, fontSize: 13, marginTop: spacing.sm },
    disabled: { opacity: 0.65 },
  });
}
