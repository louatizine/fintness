import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { exercises as exercisesApi, programs as programsApi, users, workouts } from '../services/api';
import { ExerciseHowToModal, ExerciseThumb, HowToButton } from '../components/ExerciseHowTo';
import { ProgramPicker } from './ProgramPicker';
import { EmptyState } from '../components/EmptyState';
import { AppDialog } from '../components/AppDialog';
import { ScreenSkeleton } from '../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { apiErrorMessage, formatDate } from '../../i18n';
import type { ActiveProgramSlot, CardioIntensity, Equipment, Exercise, ExerciseKind, SetLog } from '../types/models';
import { EQUIPMENT } from '../types/models';
import { isGpsTrackable } from '../utils/metPreview';
import type { GpsSeedKey, TodayStackParamList } from '../navigation';

const DEFAULT_LINEUP = ['Front squat', 'Romanian deadlift', 'Hanging knee raise'];
const MUSCLE_GROUPS = ['legs', 'chest', 'back', 'shoulders', 'core', 'arms', 'cardio'];
const ACTIVE_SESSION_KEY = 'ironlog.activeWorkoutSession';

type StoredSession = { dayKey: string; sessionId: string };

async function readStoredSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.dayKey || !parsed?.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoredSession(dayKey: string, sessionId: string) {
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ dayKey, sessionId } satisfies StoredSession));
}

async function clearStoredSession() {
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
}

type ConfirmState =
  | { kind: 'advance'; advanceKind: 'complete' | 'skip' }
  | { kind: 'deleteExercise'; exercise: Exercise }
  | null;

type Draft = {
  weight: number;
  reps: number;
  durationMin: number;
  distanceKm: string;
  intensity: CardioIntensity;
};

type ActiveState = {
  assignment: { id: string; programId: string; startedAt: string; currentDayIndex: number; active: boolean };
  programName: string;
  assignedByCoachName: string | null;
  today: { dayIndex: number; dayLabel: string; exercises: ActiveProgramSlot[] };
};

function defaultDraft(exercise: Exercise, slot?: ActiveProgramSlot): Draft {
  return {
    weight: 0,
    reps: slot?.suggestion?.repMin ?? slot?.targetRepMax ?? exercise.targetRepMax ?? 8,
    durationMin: 20,
    distanceKm: '',
    intensity: 'moderate',
  };
}

function formatRest(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useScreenTheme() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return { colors, styles };
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useScreenTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step,
  suffix,
  min = 0,
}: {
  label: string;
  value: number | string;
  onChange: (next: number) => void;
  step: number;
  suffix?: string;
  min?: number;
}) {
  const numeric = typeof value === 'number' ? value : 0;
  const { styles } = useScreenTheme();
  return (
    <View>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(min, numeric - step))} style={styles.stepButton}>
          <Text style={styles.stepText}>-</Text>
        </Pressable>
        <Text style={styles.controlValue}>
          {value}
          {suffix ? <Text style={styles.unit}>{suffix}</Text> : null}
        </Text>
        <Pressable onPress={() => onChange(numeric + step)} style={styles.stepButton}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddExerciseForm({
  onCreated,
  onCancel,
  metOptions,
}: {
  onCreated: (exercise: Exercise) => void;
  onCancel: () => void;
  metOptions: Exercise[];
}) {
  const { t } = useTranslation();
  const { colors, styles } = useScreenTheme();
  const [name, setName] = useState('');
  const [type, setType] = useState<ExerciseKind>('strength');
  const [muscleGroup, setMuscleGroup] = useState('legs');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [metBasis, setMetBasis] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim()) {
      setError(t('today.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await exercisesApi.create({
        name: name.trim(),
        type,
        muscleGroup: type === 'cardio' ? 'cardio' : muscleGroup,
        metBasis: type === 'cardio' ? metBasis : null,
        equipment: type === 'cardio' ? (equipment === 'barbell' ? 'none' : equipment) : equipment,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(created);
    } catch (err) {
      setError(apiErrorMessage(err, t('today.createFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{t('today.customExercise')}</Text>
      <Text style={styles.cardTitle}>{t('today.addExerciseTitle')}</Text>
      <Text style={styles.label}>{t('today.name')}</Text>
      <TextInput value={name} onChangeText={setName} placeholder={t('today.namePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('today.type')}</Text>
      <View style={styles.chipRow}>
        <Chip label={t('today.strength')} active={type === 'strength'} onPress={() => { setType('strength'); setEquipment('barbell'); }} />
        <Chip label={t('today.cardio')} active={type === 'cardio'} onPress={() => { setType('cardio'); setEquipment('none'); }} />
      </View>
      {type === 'strength' ? (
        <>
          <Text style={styles.label}>{t('today.muscleGroup')}</Text>
          <View style={styles.chipRow}>
            {MUSCLE_GROUPS.filter((g) => g !== 'cardio').map((group) => (
              <Chip key={group} label={t(`muscles.${group}`)} active={muscleGroup === group} onPress={() => setMuscleGroup(group)} />
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('today.estimateCalories')}</Text>
          <Text style={styles.hint}>{t('today.metHint')}</Text>
          <View style={styles.chipRow}>
            {metOptions.map((option) => (
              <Chip
                key={option.seedKey || option.id}
                label={option.name}
                active={metBasis === option.seedKey}
                onPress={() => setMetBasis((current) => current === option.seedKey ? null : option.seedKey ?? null)}
              />
            ))}
          </View>
        </>
      )}
      <Text style={styles.label}>{t('today.equipment')}</Text>
      <View style={styles.chipRow}>
        {EQUIPMENT.map((item) => (
          <Chip key={item} label={t(`equipment.${item}`)} active={equipment === item} onPress={() => setEquipment(item)} />
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => void submit()} disabled={saving} style={[styles.completeButton, saving && styles.disabled]}>
        {saving ? <Text style={styles.completeText}>{t('common.loading')}</Text> : <Text style={styles.completeText}>{t('today.saveExercise')}</Text>}
      </Pressable>
      <Pressable onPress={onCancel} style={styles.textButton}><Text style={styles.textButtonLabel}>{t('common.cancel')}</Text></Pressable>
    </View>
  );
}

export function TodayScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList, 'TodayHome'>>();
  const { colors, styles } = useScreenTheme();
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [lineupIds, setLineupIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [completed, setCompleted] = useState<Record<string, number>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timer, setTimer] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | ExerciseKind>('all');
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [lastCalories, setLastCalories] = useState<Record<string, number | null>>({});
  const [active, setActive] = useState<ActiveState | null>(null);
  const [browsePrograms, setBrowsePrograms] = useState(false);
  const [howTo, setHowTo] = useState<Exercise | null>(null);
  const [pendingDialog, setPendingDialog] = useState<ConfirmState>(null);
  const [manualGps, setManualGps] = useState<Record<string, boolean>>({});
  const dayKey = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const [list, profile, program] = await Promise.all([
        exercisesApi.getAll(),
        users.getMe().catch(() => null),
        programsApi.getActive().catch(() => ({ assignment: null, program: null, today: null })),
      ]);
      setLibrary(list);
      setWeightKg(profile?.weightKg ?? null);
      const nextActive = program.assignment && program.today && program.program
        ? { assignment: program.assignment, programName: program.program.name, assignedByCoachName: program.program.assignedByCoachName ?? null, today: program.today }
        : null;
      setActive(nextActive);
      const nextKey = nextActive ? `${nextActive.assignment.id}:${nextActive.today.dayIndex}` : 'free';
      const slots = new Map((nextActive?.today.exercises ?? []).map((slot) => [slot.exerciseId, slot]));
      if (dayKey.current !== nextKey) {
        dayKey.current = nextKey;
        const stored = await readStoredSession();
        if (stored?.dayKey === nextKey && stored.sessionId) {
          sessionIdRef.current = stored.sessionId;
          setSessionId(stored.sessionId);
          try {
            const history = await workouts.getHistory(10);
            const session = history.find((item) => (item._id || item.id) === stored.sessionId);
            sessionStartedAt.current = session?.startedAt ?? null;
            const counts: Record<string, number> = {};
            for (const set of session?.sets ?? []) {
              if (set.exerciseId) counts[set.exerciseId] = (counts[set.exerciseId] ?? 0) + 1;
            }
            setCompleted(counts);
          } catch {
            setCompleted({});
          }
        } else {
          sessionIdRef.current = null;
          sessionStartedAt.current = null;
          setCompleted({});
          setSessionId(null);
        }
        if (nextActive) {
          setLineupIds(nextActive.today.exercises.map((slot) => slot.exerciseId));
        } else {
          const defaults = list.filter((exercise) => DEFAULT_LINEUP.includes(exercise.name)).map((exercise) => exercise.id);
          setLineupIds(defaults.length ? defaults : list.filter((exercise) => exercise.type === 'strength').slice(0, 3).map((exercise) => exercise.id));
        }
        const nextDrafts: Record<string, Draft> = {};
        for (const exercise of list) {
          nextDrafts[exercise.id] = defaultDraft(exercise, slots.get(exercise.id));
        }
        setDrafts(nextDrafts);
      } else {
        setDrafts((current) => {
          const next = { ...current };
          for (const exercise of list) {
            if (!next[exercise.id]) next[exercise.id] = defaultDraft(exercise, slots.get(exercise.id));
          }
          return next;
        });
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('today.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const interval = setInterval(() => setTimer((value) => (value && value > 0 ? value - 1 : null)), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (timer === 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [timer]);

  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const slotById = new Map((active?.today.exercises ?? []).map((slot) => [slot.exerciseId, slot]));
  const lineup = lineupIds.map((id) => byId.get(id)).filter((exercise): exercise is Exercise => Boolean(exercise));
  const available = library.filter((exercise) => !lineupIds.includes(exercise.id) && (filter === 'all' || exercise.type === filter));
  const doneCount = Object.values(completed).reduce((sum, value) => sum + value, 0);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? defaultDraft(byId.get(id)!)), ...patch } }));
  }

  async function rememberSession(id: string, startedAt?: string) {
    sessionIdRef.current = id;
    sessionStartedAt.current = startedAt ?? sessionStartedAt.current ?? new Date().toISOString();
    setSessionId(id);
    if (dayKey.current) await writeStoredSession(dayKey.current, id);
  }

  async function persistSet(set: Omit<SetLog, 'id' | 'sessionId' | 'completed'>) {
    const currentId = sessionIdRef.current ?? sessionId;
    if (!currentId) {
      const startedAt = sessionStartedAt.current ?? new Date().toISOString();
      const session = await workouts.log({
        startedAt,
        sets: [set],
        userProgramId: active?.assignment.id,
        programId: active?.assignment.programId,
        dayIndex: active?.today.dayIndex,
        dayLabel: active?.today.dayLabel,
      });
      await rememberSession(session._id, session.startedAt ?? startedAt);
      return session.sets?.[0];
    }
    const result = await workouts.addSet(currentId, set);
    return result.sets[0];
  }

  function draftToSet(exercise: Exercise): Omit<SetLog, 'id' | 'sessionId' | 'completed'> | null {
    const draft = drafts[exercise.id] ?? defaultDraft(exercise, slotById.get(exercise.id));
    const setNumber = (completed[exercise.id] ?? 0) + 1;
    const completedAt = new Date().toISOString();
    if (exercise.type === 'cardio') {
      if (draft.durationMin <= 0) return null;
      const distance = Number(draft.distanceKm.replace(',', '.'));
      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        kind: 'cardio',
        setNumber,
        durationMin: draft.durationMin,
        distanceKm: Number.isFinite(distance) && distance > 0 ? distance : null,
        intensity: draft.intensity,
        completedAt,
      };
    }
    if (draft.reps <= 0 || draft.weight < 0) return null;
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      kind: 'strength',
      setNumber,
      weight: draft.weight,
      reps: draft.reps,
      completedAt,
    };
  }

  async function saveUnloggedDrafts() {
    const sets = lineup
      .filter((exercise) => (completed[exercise.id] ?? 0) === 0)
      .filter((exercise) => !isGpsTrackable(exercise.seedKey) || manualGps[exercise.id])
      .map(draftToSet)
      .filter((set): set is Omit<SetLog, 'id' | 'sessionId' | 'completed'> => Boolean(set));
    if (sets.length === 0) return sessionIdRef.current ?? sessionId;
    const currentId = sessionIdRef.current ?? sessionId;
    if (!currentId) {
      const startedAt = sessionStartedAt.current ?? new Date().toISOString();
      const session = await workouts.log({
        startedAt,
        sets,
        userProgramId: active?.assignment.id,
        programId: active?.assignment.programId,
        dayIndex: active?.today.dayIndex,
        dayLabel: active?.today.dayLabel,
      });
      await rememberSession(session._id, session.startedAt ?? startedAt);
    } else {
      for (const set of sets) await workouts.addSet(currentId, set);
    }
    setCompleted((current) => {
      const next = { ...current };
      for (const set of sets) next[set.exerciseId] = (next[set.exerciseId] ?? 0) + 1;
      return next;
    });
    return sessionIdRef.current ?? sessionId;
  }

  async function completeStrength(exercise: Exercise) {
    const draft = drafts[exercise.id] ?? defaultDraft(exercise, slotById.get(exercise.id));
    setSaving(true);
    setError('');
    try {
      await persistSet({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        kind: 'strength',
        setNumber: (completed[exercise.id] ?? 0) + 1,
        weight: draft.weight,
        reps: draft.reps,
        completedAt: new Date().toISOString(),
      });
      setCompleted((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? 0) + 1 }));
      if (exercise.restSeconds) setTimer(exercise.restSeconds);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setError(apiErrorMessage(err, t('today.logSetFailed')));
    } finally {
      setSaving(false);
    }
  }

  function startGps(exercise: Exercise) {
    const seedKey = exercise.seedKey;
    if (seedKey !== 'running' && seedKey !== 'cycling') return;
    navigation.navigate('RunTracking', {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      seedKey: seedKey as GpsSeedKey,
      weightKg,
      dayKey: dayKey.current ?? 'free',
      setNumber: (completed[exercise.id] ?? 0) + 1,
      userProgramId: active?.assignment.id,
      programId: active?.assignment.programId,
      dayIndex: active?.today.dayIndex,
      dayLabel: active?.today.dayLabel,
      intensity: (drafts[exercise.id] ?? defaultDraft(exercise)).intensity,
    });
  }

  async function completeCardio(exercise: Exercise) {
    const draft = drafts[exercise.id] ?? defaultDraft(exercise);
    if (draft.durationMin <= 0) {
      setError(t('today.cardioNeedsDuration'));
      return;
    }
    const distance = Number(draft.distanceKm.replace(',', '.'));
    setSaving(true);
    setError('');
    try {
      const logged = await persistSet({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        kind: 'cardio',
        setNumber: (completed[exercise.id] ?? 0) + 1,
        durationMin: draft.durationMin,
        distanceKm: Number.isFinite(distance) && distance > 0 ? distance : null,
        intensity: draft.intensity,
        completedAt: new Date().toISOString(),
      });
      setCompleted((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? 0) + 1 }));
      setLastCalories((current) => ({ ...current, [exercise.id]: logged?.caloriesBurned ?? null }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(apiErrorMessage(err, t('today.logCardioFailed')));
    } finally {
      setSaving(false);
    }
  }

  async function changeRest(exercise: Exercise, next: number) {
    const restSeconds = Math.max(15, Math.min(600, next));
    setLibrary((current) => current.map((item) => item.id === exercise.id ? { ...item, restSeconds, restOverridden: true } : item));
    try {
      await exercisesApi.setRest(exercise.id, restSeconds);
    } catch (err) {
      setError(apiErrorMessage(err, t('today.restSaveFailed')));
    }
  }

  function tryVariation(exercise: Exercise, nextId: string) {
    const next = byId.get(nextId);
    if (!next) {
      setError(t('today.variationMissing'));
      return;
    }
    setLineupIds((ids) => ids.map((id) => (id === exercise.id ? nextId : id)));
    setDrafts((current) => ({ ...current, [nextId]: current[nextId] ?? defaultDraft(next, slotById.get(exercise.id)) }));
    void Haptics.selectionAsync();
  }

  async function advanceDay(kind: 'complete' | 'skip') {
    setSaving(true);
    setError('');
    try {
      if (kind === 'complete') {
        const id = await saveUnloggedDrafts();
        if (id) await workouts.complete(id).catch(() => null);
        await programsApi.completeDay();
        await clearStoredSession();
        sessionIdRef.current = null;
        sessionStartedAt.current = null;
        setSessionId(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await programsApi.skipDay();
      }
      dayKey.current = null;
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t('today.programDayFailed')));
    } finally {
      setSaving(false);
    }
  }

  function confirmAdvance(kind: 'complete' | 'skip') {
    setPendingDialog({ kind: 'advance', advanceKind: kind });
  }

  function confirmDelete(exercise: Exercise) {
    setPendingDialog({ kind: 'deleteExercise', exercise });
  }

  function runConfirm() {
    const current = pendingDialog;
    setPendingDialog(null);
    if (!current) return;
    if (current.kind === 'advance') {
      void advanceDay(current.advanceKind);
      return;
    }
    void (async () => {
      try {
        await exercisesApi.remove(current.exercise.id);
        setLineupIds((ids) => ids.filter((id) => id !== current.exercise.id));
        setLibrary((items) => items.filter((item) => item.id !== current.exercise.id));
      } catch (err) {
        setError(apiErrorMessage(err, t('today.deleteFailed')));
      }
    })();
  }

  if (loading) return <ScreenSkeleton variant="list" />;

  const todayLabel = formatDate(new Date(), { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppDialog
        visible={Boolean(pendingDialog)}
        title={
          pendingDialog?.kind === 'advance'
            ? pendingDialog.advanceKind === 'complete' ? t('today.finishDayTitle') : t('today.skipDayTitle')
            : t('today.deleteExerciseTitle')
        }
        body={
          pendingDialog?.kind === 'advance'
            ? pendingDialog.advanceKind === 'complete' ? t('today.finishDayBody') : t('today.skipDayBody')
            : pendingDialog ? t('today.deleteExerciseBody', { name: pendingDialog.exercise.name }) : ''
        }
        confirmLabel={
          pendingDialog?.kind === 'advance'
            ? pendingDialog.advanceKind === 'complete' ? t('today.finish') : t('common.skip')
            : t('common.delete')
        }
        cancelLabel={t('common.cancel')}
        tone={pendingDialog?.kind === 'deleteExercise' || (pendingDialog?.kind === 'advance' && pendingDialog.advanceKind === 'skip') ? 'danger' : 'success'}
        icon={pendingDialog?.kind === 'deleteExercise' ? 'trash-outline' : pendingDialog?.advanceKind === 'complete' ? 'checkmark-done-outline' : 'play-skip-forward-outline'}
        onCancel={() => setPendingDialog(null)}
        onConfirm={runConfirm}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flex: 1, paddingEnd: spacing.sm }}>
            <Text style={styles.eyebrow}>{todayLabel}</Text>
            <Text style={styles.title}>{active ? active.today.dayLabel : t('today.title')}</Text>
            {active ? <Text style={styles.programName}>{active.programName}</Text> : null}
            {active?.assignedByCoachName ? <Text style={styles.programName}>{t('today.assignedByCoach', { name: active.assignedByCoachName })}</Text> : null}
          </View>
          <Pressable onPress={() => setBrowsePrograms((open) => !open)} style={styles.programLink}>
            <Text style={styles.programLinkText}>{browsePrograms ? t('today.workout') : active ? t('today.change') : t('today.programs')}</Text>
          </Pressable>
        </View>

        {browsePrograms ? (
          <ProgramPicker
            library={library}
            activeProgramId={active?.assignment.programId ?? null}
            onClose={() => setBrowsePrograms(false)}
            onChanged={() => {
              setBrowsePrograms(false);
              dayKey.current = null;
              void load();
            }}
          />
        ) : (
          <>
            {timer !== null && timer > 0 && (
              <View style={styles.timer}>
                <Text style={styles.timerLabel}>{t('today.chronos')}</Text>
                <View style={styles.ltr}>
                  <Text style={styles.timerValue}>{formatRest(timer)}</Text>
                </View>
                <View style={styles.timerActions}>
                  <Pressable onPress={() => setTimer(timer + 15)} style={styles.timerHit}>
                    <Text style={styles.timerButton}>{t('today.plus15')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setTimer(null)} style={styles.timerHit}>
                    <Text style={styles.timerButton}>{t('common.skip')}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {weightKg === null ? (
              <Text style={styles.banner}>{t('today.bodyweightBanner')}</Text>
            ) : null}

            {!active ? (
              <Pressable onPress={() => setBrowsePrograms(true)} style={styles.bannerButton}>
                <Text style={styles.banner}>{t('today.noProgramBanner')}</Text>
              </Pressable>
            ) : null}

            <View style={styles.sessionMeta}>
              <Text style={styles.metaLabel}>{t('today.sessionProgress')}</Text>
              <Text style={[styles.metaValue, doneCount > 0 && { color: colors.success }]}>{t('today.logged', { n: doneCount })}</Text>
            </View>

            {lineup.length === 0 ? (
              <EmptyState title={t('today.emptyLineup')} hint={t('today.addExercise')} />
            ) : null}

            {lineup.map((exercise) => {
              const draft = drafts[exercise.id] ?? defaultDraft(exercise, slotById.get(exercise.id));
              const done = completed[exercise.id] ?? 0;
              const slot = slotById.get(exercise.id);
              const sets = slot?.targetSets ?? exercise.targetSets;
              const repMin = slot?.suggestion?.repMin ?? slot?.targetRepMin ?? exercise.targetRepMin;
              const repMax = slot?.suggestion?.repMax ?? slot?.targetRepMax ?? exercise.targetRepMax;
              const restNote = exercise.type === 'strength' && exercise.restSeconds
                ? ` · ${t('today.restSuffix', { seconds: exercise.restSeconds })}${exercise.restOverridden ? ` ${t('today.restYours')}` : ''}`
                : '';
              const target = exercise.type === 'strength' && sets
                ? `${sets} × ${repMin}-${repMax}${restNote}`
                : exercise.type === 'cardio' ? t('today.cardio') : '';
              return (
                <View key={exercise.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        <HowToButton onPress={() => setHowTo(exercise)} />
                      </View>
                      <Text style={styles.target}>{target}</Text>
                    </View>
                    <Pressable onPress={() => setLineupIds((ids) => ids.filter((id) => id !== exercise.id))} style={styles.iconHit}>
                      <Ionicons name="close" size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                  {slot?.suggestion ? (
                    <View style={styles.suggestion}>
                      <Text style={styles.suggestionNote}>{slot.suggestion.note}</Text>
                      {slot.suggestion.nextVariation ? (
                        <Pressable onPress={() => tryVariation(exercise, slot.suggestion!.nextVariation!.id)} style={styles.variationButton}>
                          <Text style={styles.variationText}>{t('today.tryVariation', { name: slot.suggestion.nextVariation.name })}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {exercise.type === 'strength' ? (
                    <>
                      <View style={styles.controls}>
                        <Stepper
                          label={t('today.weight')}
                          value={draft.weight || t('today.bw')}
                          suffix={draft.weight ? ` ${t('common.kg')}` : ''}
                          step={2.5}
                          onChange={(weight) => patchDraft(exercise.id, { weight })}
                        />
                        <Stepper label={t('today.reps')} value={draft.reps} step={1} min={1} onChange={(reps) => patchDraft(exercise.id, { reps })} />
                      </View>
                      <View style={{ marginTop: spacing.md }}>
                        <Stepper
                          label={t('today.rest')}
                          value={exercise.restSeconds ?? 90}
                          suffix=" s"
                          step={15}
                          min={15}
                          onChange={(restSeconds) => void changeRest(exercise, restSeconds)}
                        />
                      </View>
                      <Pressable style={[styles.completeButton, saving && styles.disabled]} disabled={saving} onPress={() => void completeStrength(exercise)}>
                        <Ionicons name="checkmark-circle" size={22} color={done ? colors.success : colors.ink} />
                        <Text style={styles.completeText} numberOfLines={2}>{done ? t('today.completeSetDone', { n: done }) : t('today.completeSet')}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      {Platform.OS !== 'web' && isGpsTrackable(exercise.seedKey) ? (
                        <>
                          <Pressable style={[styles.completeButton, saving && styles.disabled]} disabled={saving} onPress={() => startGps(exercise)}>
                            <Ionicons name={exercise.seedKey === 'cycling' ? 'bicycle' : 'walk'} size={22} color={colors.ink} />
                            <Text style={styles.completeText} numberOfLines={2}>
                              {exercise.seedKey === 'cycling' ? t('today.startRide') : t('today.startRun')}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setManualGps((current) => ({ ...current, [exercise.id]: !current[exercise.id] }))}
                            style={styles.textButton}
                          >
                            <Text style={styles.textButtonLabel}>
                              {manualGps[exercise.id] ? t('today.hideManualLog') : t('today.logWithoutGps')}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}
                      {!isGpsTrackable(exercise.seedKey) || manualGps[exercise.id] || Platform.OS === 'web' ? (
                        <>
                          <View style={styles.controls}>
                            <Stepper label={t('today.duration')} value={draft.durationMin} suffix=" min" step={1} min={1} onChange={(durationMin) => patchDraft(exercise.id, { durationMin })} />
                            <View>
                              <Text style={styles.controlLabel}>{t('today.distanceKm')}</Text>
                              <TextInput
                                value={draft.distanceKm}
                                onChangeText={(distanceKm) => patchDraft(exercise.id, { distanceKm })}
                                keyboardType="decimal-pad"
                                placeholder={t('common.optional')}
                                placeholderTextColor={colors.muted}
                                style={styles.smallInput}
                              />
                            </View>
                          </View>
                          <Text style={styles.controlLabel}>{t('today.intensity')}</Text>
                          <View style={styles.chipRow}>
                            {([
                              ['low', 'today.intensityLow'],
                              ['moderate', 'today.intensityModerate'],
                              ['high', 'today.intensityHigh'],
                            ] as const).map(([level, key]) => (
                              <Chip
                                key={level}
                                label={t(key)}
                                active={draft.intensity === level}
                                onPress={() => patchDraft(exercise.id, { intensity: level })}
                              />
                            ))}
                          </View>
                          {typeof lastCalories[exercise.id] === 'number' ? (
                            <Text style={styles.target}>{t('today.lastLogKcal', { kcal: lastCalories[exercise.id] })}</Text>
                          ) : null}
                          <Pressable style={[styles.completeButton, saving && styles.disabled]} disabled={saving} onPress={() => void completeCardio(exercise)}>
                            <Ionicons name="checkmark-circle" size={22} color={done ? colors.success : colors.ink} />
                            <Text style={styles.completeText} numberOfLines={2}>{done ? t('today.logCardioDone', { n: done }) : t('today.logCardio')}</Text>
                          </Pressable>
                        </>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}

            {active ? (
              <View style={styles.dayActions}>
                <Pressable onPress={() => confirmAdvance('complete')} disabled={saving} style={[styles.completeButton, { flex: 1 }, saving && styles.disabled]}>
                  <Text style={styles.completeText} numberOfLines={2}>{t('today.finishDay')}</Text>
                </Pressable>
                <Pressable onPress={() => confirmAdvance('skip')} disabled={saving} style={styles.skipDay}>
                  <Text style={styles.skipDayText}>{t('today.skipDay')}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.libraryHeader}>
              <Text style={styles.listLabel}>{active ? t('today.addExtra') : t('today.library')}</Text>
              <Pressable onPress={() => setShowAdd((open) => !open)} style={styles.addLink}>
                <Ionicons name="add" size={18} color={colors.gold} />
                <Text style={styles.addLinkText}>{t('today.addExercise')}</Text>
              </Pressable>
            </View>
            <View style={styles.chipRow}>
              <Chip label={t('common.all')} active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={t('today.strength')} active={filter === 'strength'} onPress={() => setFilter('strength')} />
              <Chip label={t('today.cardio')} active={filter === 'cardio'} onPress={() => setFilter('cardio')} />
            </View>
            {showAdd ? (
              <AddExerciseForm
                metOptions={library.filter((item) => item.type === 'cardio' && item.seedKey)}
                onCreated={(exercise) => {
                  setLibrary((current) => [...current, exercise]);
                  setLineupIds((ids) => [...ids, exercise.id]);
                  setDrafts((current) => ({ ...current, [exercise.id]: defaultDraft(exercise) }));
                  setShowAdd(false);
                }}
                onCancel={() => setShowAdd(false)}
              />
            ) : null}
            {available.map((exercise) => (
              <View key={exercise.id} style={styles.libraryRow}>
                <ExerciseThumb uri={exercise.referenceImageUrl} />
                <Pressable style={styles.libraryMain} onPress={() => setLineupIds((ids) => [...ids, exercise.id])}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.libraryName}>{exercise.name}</Text>
                    <Text style={styles.libraryMeta}>
                      {exercise.type === 'cardio' ? t('today.cardio') : t('today.strength')}
                      {' · '}
                      {exercise.muscleGroup ? t(`muscles.${exercise.muscleGroup}`, { defaultValue: exercise.muscleGroup }) : t('today.untagged')}
                      {' · '}
                      {t(`equipment.${exercise.equipment}`, { defaultValue: exercise.equipment })}
                      {exercise.isCustom ? ` · ${t('today.custom')}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.gold} />
                </Pressable>
                <HowToButton onPress={() => setHowTo(exercise)} />
                {exercise.isCustom ? (
                  <Pressable onPress={() => confirmDelete(exercise)} style={styles.libraryDelete}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <ExerciseHowToModal exercise={howTo} onClose={() => setHowTo(null)} />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg, paddingTop: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  programName: { color: colors.muted, marginTop: 4, fontWeight: '700' },
  programLink: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 4, justifyContent: 'center' },
  programLinkText: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  timer: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timerLabel: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  timerValue: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  ltr: { direction: 'ltr' },
  timerActions: { marginStart: 'auto', flexDirection: 'row', gap: spacing.sm },
  timerHit: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timerButton: { color: colors.ink, fontWeight: '800' },
  sessionMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  metaLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  metaValue: { color: colors.text, fontWeight: '700' },
  banner: { color: colors.gold, backgroundColor: colors.accentMuted, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, fontSize: 13, fontWeight: '700' },
  bannerButton: { marginBottom: 0 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  suggestion: { marginTop: spacing.sm, backgroundColor: colors.accentMuted, borderRadius: radius.sm, padding: spacing.sm },
  suggestionNote: { color: colors.gold, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  variationButton: { marginTop: 8, minHeight: 44, justifyContent: 'center' },
  variationText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6, marginBottom: spacing.sm },
  exerciseName: { color: colors.text, fontSize: 19, fontWeight: '800' },
  target: { color: colors.muted, marginTop: 4, fontSize: 12 },
  controls: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg, flexWrap: 'wrap' },
  controlLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.accent, fontSize: 22 },
  controlValue: { minWidth: 50, color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  unit: { color: colors.muted, fontSize: 12 },
  completeButton: { marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  completeText: { color: colors.ink, fontWeight: '900', textAlign: 'center' },
  dayActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  skipDay: { marginTop: spacing.lg, paddingHorizontal: spacing.md, minHeight: 48, justifyContent: 'center' },
  skipDayText: { color: colors.muted, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  chipTextActive: { color: colors.ink },
  smallInput: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 44, minWidth: 90, paddingHorizontal: 10, borderRadius: radius.sm },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12, fontSize: 15, borderRadius: radius.sm },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  textButton: { alignItems: 'center', marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { color: colors.muted, fontWeight: '700' },
  listLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  libraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  addLinkText: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  libraryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, marginTop: spacing.sm, paddingStart: spacing.sm },
  libraryMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, gap: 8, minHeight: 44 },
  libraryName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  libraryMeta: { color: colors.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  libraryDelete: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
    iconHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  });
}
