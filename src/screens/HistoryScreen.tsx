import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { workouts } from '../services/api';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage, formatDate, formatNumber } from '../../i18n';
import type { HistoryStackParamList, RootTabs } from '../navigation';
import type { ExerciseKind, SetLog, WorkoutCalorieSummary, WorkoutSession } from '../types/models';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<HistoryStackParamList, 'HistoryHome'>,
  BottomTabNavigationProp<RootTabs>
>;

type TFn = (key: string, opts?: Record<string, unknown>) => string;
type HistoryView = 'exercises' | 'sessions';

type ExerciseAppearance = {
  sessionId: string;
  startedAt: string;
  endedAt?: string | null;
  dayLabel?: string;
  sessionDurationMin: number;
  exerciseDurationMin: number;
  sets: SetLog[];
  volume: number;
  calories: number | null;
};

type ExerciseHistory = {
  id: string;
  name: string;
  kind: ExerciseKind;
  appearances: ExerciseAppearance[];
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function formatClock(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(date, { hour: '2-digit', minute: '2-digit' });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

function summaryRange() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    weekFrom: startOfLocalDay(weekStart),
    weekTo: startOfLocalDay(weekEnd),
    monthFrom: startOfLocalDay(monthStart),
    monthTo: startOfLocalDay(monthEnd),
  };
}

function sessionIdOf(session: WorkoutSession) {
  return session._id || session.id;
}

function sessionDurationMin(session: WorkoutSession) {
  if (session.durationMin && session.durationMin > 0) return session.durationMin;
  const start = new Date(session.startedAt).getTime();
  const sets = session.sets ?? [];
  const endIso = session.endedAt || session.completedAt || sets[sets.length - 1]?.completedAt;
  const end = endIso ? new Date(endIso).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function spanMinutes(sets: SetLog[]) {
  const times = sets
    .map((set) => (set.completedAt ? new Date(set.completedAt).getTime() : NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return 0;
  if (times.length === 1) {
    return sets.reduce((sum, set) => sum + (set.kind === 'cardio' ? set.durationMin ?? 0 : 0), 0);
  }
  return Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 60000));
}

function groupSets(sets: SetLog[]) {
  const grouped = new Map<string, SetLog[]>();
  for (const set of sets) {
    const key = set.exerciseId || set.exerciseName || 'exercise';
    const list = grouped.get(key) ?? [];
    list.push(set);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([id, rows]) => ({ id, name: rows[0]?.exerciseName || id, sets: rows }));
}

function groupByExercise(sessions: WorkoutSession[]): ExerciseHistory[] {
  const map = new Map<string, ExerciseHistory>();
  for (const session of sessions) {
    const duration = sessionDurationMin(session);
    for (const group of groupSets(session.sets ?? [])) {
      const kind: ExerciseKind = group.sets[0]?.kind === 'cardio' ? 'cardio' : 'strength';
      const existing = map.get(group.id) ?? { id: group.id, name: group.name, kind, appearances: [] };
      const volume = group.sets.reduce((sum, set) => sum + (set.kind === 'cardio' ? 0 : (set.weight ?? 0) * (set.reps ?? 0)), 0);
      const calories = group.sets.reduce<number | null>((sum, set) => {
        if (typeof set.caloriesBurned !== 'number') return sum;
        return (sum ?? 0) + set.caloriesBurned;
      }, null);
      existing.appearances.push({
        sessionId: sessionIdOf(session),
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? session.completedAt,
        dayLabel: session.dayLabel,
        sessionDurationMin: duration,
        exerciseDurationMin: spanMinutes(group.sets),
        sets: group.sets,
        volume,
        calories,
      });
      map.set(group.id, existing);
    }
  }
  return [...map.values()].sort((a, b) => (b.appearances[0]?.startedAt ?? '').localeCompare(a.appearances[0]?.startedAt ?? ''));
}

function formatDurationLabel(minutes: number, t: TFn) {
  if (!minutes) return t('history.durationUnknown');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0) return t('history.durationHours', { hours: formatNumber(hours), minutes: formatNumber(rest) });
  return t('history.durationMinutes', { minutes: formatNumber(minutes) });
}

function setLine(set: SetLog, t: TFn) {
  const notes = set.notes?.trim() ? ` · ${set.notes.trim()}` : '';
  const heart = typeof set.avgHeartRate === 'number' ? ` · ${t('history.heartRate', { bpm: formatNumber(set.avgHeartRate) })}` : '';
  if (set.kind === 'cardio') {
    const distance = set.distanceKm ? ` · ${formatNumber(set.distanceKm)} km` : '';
    const calories = typeof set.caloriesBurned === 'number' ? ` · ${formatNumber(set.caloriesBurned)} kcal` : '';
    const intensity = set.intensity ? ` · ${t(`today.intensity${set.intensity[0].toUpperCase()}${set.intensity.slice(1)}`)}` : '';
    return t('history.cardioSetLine', {
      n: set.setNumber,
      duration: formatNumber(set.durationMin ?? 0),
      distance,
      calories,
      intensity: `${intensity}${heart}${notes}`,
    });
  }
  return `${t('history.strengthSetLine', {
    n: set.setNumber,
    weight: formatNumber(set.weight ?? 0),
    reps: formatNumber(set.reps ?? 0),
    volume: formatNumber(Math.round((set.weight ?? 0) * (set.reps ?? 0))),
  })}${heart}${notes}`;
}

function SessionTime({
  startedAt,
  endedAt,
  durationMin,
  t,
  styles,
}: {
  startedAt: string;
  endedAt?: string | null;
  durationMin: number;
  t: TFn;
  styles: ReturnType<typeof createStyles>;
}) {
  const startClock = formatClock(startedAt);
  const endClock = formatClock(endedAt);
  return (
    <Text style={styles.volume}>
      {t('history.sessionTime', {
        start: startClock || '-',
        end: endClock || '-',
        duration: formatDurationLabel(durationMin, t),
      })}
    </Text>
  );
}

function SetList({
  sets,
  sessionId,
  t,
  styles,
  onOpenRoute,
}: {
  sets: SetLog[];
  sessionId?: string;
  t: TFn;
  styles: ReturnType<typeof createStyles>;
  onOpenRoute: (sessionId: string, setId: string) => void;
}) {
  return (
    <>
      {sets.map((set, index) => {
        const canOpen = Boolean(set.hasRoute && set.id && sessionId);
        const body = (
          <>
            <View style={styles.setMain}>
              <Text style={styles.setText}>{setLine(set, t)}</Text>
              {set.hasRoute ? <Text style={styles.routeChip}>{t('history.viewRoute')}</Text> : null}
            </View>
            {set.completedAt ? <Text style={styles.setTime}>{formatClock(set.completedAt)}</Text> : null}
          </>
        );
        const key = `${set.id ?? set.exerciseId}-${set.setNumber}-${index}`;
        if (canOpen && sessionId && set.id) {
          return (
            <Pressable key={key} onPress={() => onOpenRoute(sessionId, set.id!)} style={styles.setRow}>
              {body}
            </Pressable>
          );
        }
        return (
          <View key={key} style={styles.setRow}>
            {body}
          </View>
        );
      })}
    </>
  );
}

export function HistoryScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [summary, setSummary] = useState<WorkoutCalorieSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<HistoryView>('exercises');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setError('');
      const [history, totals] = await Promise.all([
        workouts.getHistory(),
        workouts.getSummary(summaryRange()).catch(() => null),
      ]);
      setSessions(history);
      setSummary(totals);
    } catch (err) {
      setError(apiErrorMessage(err, t('history.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const exercises = useMemo(() => groupByExercise(sessions), [sessions]);

  if (loading) return <ScreenSkeleton variant="list" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('history.eyebrow')}</Text>
      <Text style={styles.title}>{t('history.title')}</Text>
      {summary ? (
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('history.thisWeek')}</Text>
            <Text style={styles.totalValue}>{formatNumber(summary.week.caloriesBurned)}</Text>
            <Text style={styles.totalUnit}>{t('history.kcalCardio')}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('history.thisMonth')}</Text>
            <Text style={styles.totalValue}>{formatNumber(summary.month.caloriesBurned)}</Text>
            <Text style={styles.totalUnit}>{t('history.kcalCardio')}</Text>
          </View>
        </View>
      ) : null}

      {sessions.length > 0 ? (
        <View style={styles.viewRow}>
          {(['exercises', 'sessions'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setView(option)}
              style={[styles.viewChip, view === option && styles.viewChipActive]}
            >
              <Text style={[styles.viewChipText, view === option && styles.viewChipTextActive]}>
                {option === 'exercises' ? t('history.viewExercises') : t('history.viewSessions')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          title={t('history.emptyTitle')}
          hint={t('history.emptyHint')}
          ctaLabel={t('history.emptyCta')}
          onCta={() => navigation.navigate('Today')}
        />
      ) : view === 'exercises' ? (
        exercises.map((exercise) => {
          const open = !collapsed[exercise.id];
          return (
            <View key={exercise.id} style={styles.sessionCard}>
              <Pressable
                onPress={() => setCollapsed((current) => ({ ...current, [exercise.id]: !current[exercise.id] }))}
                style={styles.sessionTop}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.when}>{t('history.sessionsCount', { n: formatNumber(exercise.appearances.length) })}</Text>
                  <Text style={styles.names}>{exercise.name}</Text>
                </View>
                <View style={styles.badges}>
                  <Text style={styles.badge}>{exercise.kind === 'cardio' ? t('history.cardioBadge') : t('history.strength')}</Text>
                </View>
              </Pressable>
              {open ? (
                <View style={styles.exerciseList}>
                  {exercise.appearances.map((appearance, index) => (
                    <View key={`${appearance.sessionId}-${index}`} style={styles.exerciseBlock}>
                      <Text style={styles.exerciseTitle}>
                        {formatWhen(appearance.startedAt)}
                        {appearance.dayLabel ? ` · ${appearance.dayLabel.toUpperCase()}` : ''}
                      </Text>
                      <SessionTime
                        startedAt={appearance.startedAt}
                        endedAt={appearance.endedAt}
                        durationMin={appearance.sessionDurationMin}
                        t={t}
                        styles={styles}
                      />
                      {appearance.exerciseDurationMin > 0 ? (
                        <Text style={styles.volume}>{t('history.exerciseTime', { duration: formatDurationLabel(appearance.exerciseDurationMin, t) })}</Text>
                      ) : null}
                      {appearance.volume > 0 ? (
                        <Text style={styles.volume}>{t('history.kgVolume', { volume: formatNumber(Math.round(appearance.volume)) })}</Text>
                      ) : null}
                      {typeof appearance.calories === 'number' ? (
                        <Text style={styles.volume}>{t('history.cardioCalories', { kcal: formatNumber(appearance.calories) })}</Text>
                      ) : null}
                      <SetList
                        sets={appearance.sets}
                        sessionId={appearance.sessionId}
                        t={t}
                        styles={styles}
                        onOpenRoute={(sid, setId) => navigation.navigate('CardioRoute', { sessionId: sid, setId })}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        sessions.map((session) => {
          const id = sessionIdOf(session);
          const kinds = session.kinds ?? [];
          const groups = groupSets(session.sets ?? []);
          return (
            <View key={id} style={styles.sessionCard}>
              <View style={styles.sessionTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.when}>{formatWhen(session.startedAt)}{session.dayLabel ? ` · ${session.dayLabel.toUpperCase()}` : ''}</Text>
                  <Text style={styles.names}>{session.dayLabel || t('history.session')}</Text>
                  <SessionTime
                    startedAt={session.startedAt}
                    endedAt={session.endedAt ?? session.completedAt}
                    durationMin={sessionDurationMin(session)}
                    t={t}
                    styles={styles}
                  />
                  {session.totalVolume ? (
                    <Text style={styles.volume}>{t('history.kgVolume', { volume: formatNumber(Math.round(session.totalVolume)) })}</Text>
                  ) : null}
                  {typeof session.cardioCaloriesBurned === 'number' ? (
                    <Text style={styles.volume}>{t('history.cardioCalories', { kcal: formatNumber(session.cardioCaloriesBurned) })}</Text>
                  ) : null}
                </View>
                <View style={styles.badges}>
                  {kinds.includes('strength') ? <Text style={styles.badge}>{t('history.strength')}</Text> : null}
                  {kinds.includes('cardio') ? <Text style={styles.badge}>{t('history.cardioBadge')}</Text> : null}
                </View>
              </View>
              {groups.length ? (
                <View style={styles.exerciseList}>
                  {groups.map((group) => {
                    const exerciseMins = spanMinutes(group.sets);
                    return (
                      <View key={group.id} style={styles.exerciseBlock}>
                        <Text style={styles.exerciseTitle}>{group.name}</Text>
                        {exerciseMins > 0 ? (
                          <Text style={styles.volume}>{t('history.exerciseTime', { duration: formatDurationLabel(exerciseMins, t) })}</Text>
                        ) : null}
                        <SetList
                          sets={group.sets}
                          sessionId={id}
                          t={t}
                          styles={styles}
                          onOpenRoute={(sid, setId) => navigation.navigate('CardioRoute', { sessionId: sid, setId })}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.volume}>{t('history.noSets')}</Text>
              )}
            </View>
          );
        })
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm, marginBottom: spacing.md },
    totals: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
    totalCard: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
    totalLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    totalValue: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 6 },
    totalUnit: { color: colors.muted, fontSize: 12, marginTop: 2 },
    viewRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
    viewChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    viewChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    viewChipText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
    viewChipTextActive: { color: colors.ink },
    sessionCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
    sessionTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    when: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    names: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
    volume: { color: colors.muted, fontSize: 12, marginTop: 4 },
    badges: { gap: 6, alignItems: 'flex-end' },
    badge: { color: colors.ink, backgroundColor: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
    exerciseList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
    exerciseBlock: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
    exerciseTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 4 },
    setRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
    setMain: { flex: 1, gap: 4 },
    setText: { color: colors.text, fontSize: 13, lineHeight: 18 },
    setTime: { color: colors.muted, fontSize: 12, fontWeight: '700' },
    routeChip: {
      alignSelf: 'flex-start',
      color: colors.ink,
      backgroundColor: colors.gold,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  });
}
