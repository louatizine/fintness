import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useTranslation } from 'react-i18next';
import { exercises as exercisesApi, workouts } from '../services/api';
import {
  applyOptimisticSummary,
  subscribeWorkoutStatsChanged,
} from '../services/workoutStatsEvents';
import { radius, spacing, useTheme, useThemedStyles, withAlpha, type ThemeColors } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage, formatDate, formatNumber } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { Exercise, ExerciseProgress, WorkoutSummary } from '../types/models';

const chartWidth = Dimensions.get('window').width - spacing.lg * 2;

type AuditKind = 'sessions' | 'volume' | 'streak';

function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatPace(minPerKm: number) {
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function chartSeries(progress: ExerciseProgress, t: (key: string) => string) {
  if (progress.type === 'cardio') {
    const usePace = progress.points.every((point) => point.paceMinPerKm && point.paceMinPerKm > 0);
    return {
      values: progress.points.map((point) => (usePace ? point.paceMinPerKm! : point.durationMin)),
      labels: progress.points.map((point, index) => (
        progress.points.length <= 8 || index % Math.ceil(progress.points.length / 6) === 0 ? shortDate(point.date) : ''
      )),
      yLabel: usePace ? t('progress.paceLabel') : t('progress.durationLabel'),
      latestPace: [...progress.points].reverse().find((point) => point.paceMinPerKm)?.paceMinPerKm ?? null,
    };
  }
  return {
    values: progress.points.map((point) => point.totalVolume),
    labels: progress.points.map((point, index) => (
      progress.points.length <= 8 || index % Math.ceil(progress.points.length / 6) === 0 ? shortDate(point.date) : ''
    )),
    yLabel: t('progress.volumeLabel'),
    latestPace: null as number | null,
  };
}

function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(date, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function summaryIsConsistent(summary: WorkoutSummary) {
  const volumeSum = summary.breakdown.sessions.reduce((sum, row) => sum + row.volume, 0);
  const sessionsMatch = summary.breakdown.sessions.length === summary.workoutsCompleted;
  const volumeMatch = Math.round(volumeSum) === Math.round(summary.totalVolume);
  const streakMatch = summary.breakdown.streakDays.length === summary.streak;
  return sessionsMatch && volumeMatch && streakMatch;
}

function AnimatedStatValue({ value, color }: { value: number; color: string }) {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const listener = anim.addListener(({ value: next }) => {
      setDisplay(Math.round(next));
    });
    if (prev.current === value) {
      setDisplay(value);
    } else {
      anim.setValue(prev.current);
      Animated.timing(anim, {
        toValue: value,
        duration: 450,
        useNativeDriver: false,
      }).start();
    }
    prev.current = value;
    return () => anim.removeListener(listener);
  }, [anim, value]);

  return <Text style={{ color, fontSize: 22, fontWeight: '900', marginTop: 6 }}>{formatNumber(display)}</Text>;
}

export function ProgressScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabs, 'Progress'>>();
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExerciseProgress | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [summaryRefreshing, setSummaryRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<AuditKind | null>(null);
  const selectedRef = useRef<string | null>(null);
  const summaryRef = useRef<WorkoutSummary | null>(null);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySummary = useCallback((next: WorkoutSummary | null, trusted = true) => {
    summaryRef.current = next;
    setSummary(next);
    if (!trusted) return;
    if (next && !summaryIsConsistent(next)) {
      setRecalculating(true);
    } else {
      setRecalculating(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryRefreshing(true);
    try {
      const next = await workouts.getOverview();
      applySummary(next, true);
      return next;
    } catch (err) {
      setError(apiErrorMessage(err, t('progress.loadFailed')));
      return null;
    } finally {
      setSummaryRefreshing(false);
    }
  }, [applySummary, t]);

  const load = useCallback(async (preferredId?: string | null) => {
    try {
      setError('');
      const list = await exercisesApi.getAll();
      setLibrary(list);

      let overview: WorkoutSummary | null = null;
      try {
        overview = await workouts.getOverview();
        applySummary(overview, true);
      } catch (overviewErr) {
        applySummary(null, true);
        setError(apiErrorMessage(overviewErr, t('progress.overviewLoadFailed')));
      }

      const preferred = preferredId && list.some((item) => item.id === preferredId) ? preferredId : null;
      const recent = overview?.recentExerciseId && list.some((item) => item.id === overview.recentExerciseId)
        ? overview.recentExerciseId
        : null;
      const nextId = preferred ?? recent ?? list[0]?.id ?? null;
      setSelectedId(nextId);
      selectedRef.current = nextId;
      if (nextId) {
        setChartLoading(true);
        setProgress(await workouts.getProgress(nextId));
      } else {
        setProgress(null);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('progress.loadFailed')));
    } finally {
      setLoading(false);
      setChartLoading(false);
    }
  }, [applySummary, t]);

  useFocusEffect(useCallback(() => { void load(selectedRef.current); }, [load]));

  useEffect(() => {
    return subscribeWorkoutStatsChanged(({ optimistic }) => {
      if (optimistic) {
        applySummary(applyOptimisticSummary(summaryRef.current, optimistic), false);
      }
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        void loadSummary();
      }, 50);
    });
  }, [applySummary, loadSummary]);

  useEffect(() => {
    if (!recalculating) return;
    const timer = setTimeout(() => { void loadSummary(); }, 300);
    return () => clearTimeout(timer);
  }, [recalculating, loadSummary]);

  async function selectExercise(id: string) {
    setSelectedId(id);
    selectedRef.current = id;
    setChartLoading(true);
    setError('');
    try {
      setProgress(await workouts.getProgress(id));
    } catch (err) {
      setError(apiErrorMessage(err, t('progress.loadFailed')));
      setProgress(null);
    } finally {
      setChartLoading(false);
    }
  }

  const selected = library.find((item) => item.id === selectedId);
  const series = progress && progress.points.length >= 2 ? chartSeries(progress, t) : null;
  const emptyChart = progress && progress.points.length < 2;
  const singleSession = progress?.points.length === 1;

  if (loading) return <ScreenSkeleton variant="chart" />;

  const auditRows = (() => {
    if (!summary || !audit) return [];
    if (audit === 'streak') {
      return summary.breakdown.streakDays.map((day) => ({
        key: day.date,
        title: day.date,
        detail: t('progress.auditStreakDay', {
          count: day.sessionIds.length,
          mode: day.mode === 'program' ? t('progress.modeProgram') : t('progress.modeFree'),
        }),
        value: String(day.sessionIds.length),
      }));
    }
    if (audit === 'volume') {
      return summary.breakdown.sessions.map((row) => ({
        key: row.sessionId,
        title: row.dayLabel || formatDate(new Date(row.completedAt), { month: 'short', day: 'numeric' }),
        detail: shortDate(row.completedAt),
        value: formatNumber(row.volume),
      }));
    }
    return summary.breakdown.sessions.map((row) => ({
      key: row.sessionId,
      title: row.dayLabel || t('progress.sessionFallback'),
      detail: formatDate(new Date(row.completedAt), { weekday: 'short', month: 'short', day: 'numeric' }),
      value: formatNumber(row.volume),
    }));
  })();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('progress.eyebrow')}</Text>
      <Text style={styles.title}>{t('progress.title')}</Text>
      <Text style={styles.subtitle}>{t('progress.subtitle')}</Text>

      <View style={styles.summaryHeader}>
        <Text style={styles.summaryHeading}>{t('progress.summaryHeading')}</Text>
        <View style={styles.updatedRow}>
          <Text style={styles.updatedText}>
            {recalculating
              ? t('progress.recalculating')
              : summary
                ? t('progress.updatedAt', { time: formatUpdatedAt(summary.computedAt) })
                : t('progress.updatedPending')}
          </Text>
          <Pressable
            onPress={() => void loadSummary()}
            style={styles.refreshBtn}
            accessibilityRole="button"
            accessibilityLabel={t('progress.refresh')}
          >
            {summaryRefreshing ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.gold} />
            )}
          </Pressable>
        </View>
      </View>

      {summary ? (
        <View style={styles.statsRow}>
          {([
            { kind: 'sessions' as const, label: t('progress.statSessions'), value: summary.workoutsCompleted },
            { kind: 'volume' as const, label: t('progress.statVolume'), value: summary.totalVolume },
            { kind: 'streak' as const, label: t('progress.statStreak'), value: summary.streak },
          ]).map((stat) => (
            <Pressable
              key={stat.kind}
              onPress={() => setAudit(stat.kind)}
              style={styles.statCard}
            >
              <Text style={styles.statLabel}>{stat.label}</Text>
              {recalculating ? (
                <Text style={styles.statValue}>—</Text>
              ) : (
                <AnimatedStatValue value={stat.value} color={colors.gold} />
              )}
              <Text style={styles.statHint}>{t('progress.tapForBreakdown')}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.statsMissing}>
          <Text style={styles.statsMissingText}>{t('progress.overviewMissing')}</Text>
        </View>
      )}
      {summary ? (
        <Text style={styles.streakHint}>
          {summary.streakMode === 'program' ? t('progress.streakHintProgram') : t('progress.streakHintFree')}
        </Text>
      ) : null}

      {library.length === 0 ? (
        <EmptyState
          title={t('progress.emptyLibraryTitle')}
          hint={t('progress.emptyLibraryHint')}
          ctaLabel={t('progress.emptyLibraryCta')}
          onCta={() => navigation.navigate('Today')}
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
          {library.map((exercise) => (
            <Pressable
              key={exercise.id}
              onPress={() => void selectExercise(exercise.id)}
              style={[styles.pick, selectedId === exercise.id && styles.pickActive]}
            >
              <Text style={[styles.pickText, selectedId === exercise.id && styles.pickTextActive]}>{exercise.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {selected ? (
        <Text style={styles.selectedMeta}>
          {selected.type === 'cardio' ? t('today.cardio') : t('today.strength')} · {selected.muscleGroup ? t(`muscles.${selected.muscleGroup}`, { defaultValue: selected.muscleGroup }) : t('progress.untagged')}
        </Text>
      ) : null}
      {chartLoading ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.lg }} /> : null}
      {!chartLoading && emptyChart ? (
        <EmptyState
          title={singleSession ? t('progress.oneMoreTitle') : t('progress.emptyTitle')}
          hint={singleSession ? t('progress.oneMoreHint') : t('progress.emptyHint')}
        />
      ) : null}
      {!chartLoading && series ? (
        <View style={styles.chartCard}>
          <Text style={styles.chartLabel}>{series.yLabel}</Text>
          <View style={styles.ltr}>
            <LineChart
              data={{ labels: series.labels, datasets: [{ data: series.values }] }}
              width={chartWidth}
              height={220}
              yAxisInterval={1}
              formatYLabel={(value) => formatNumber(Number(value))}
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: progress?.type === 'cardio' ? 1 : 0,
                color: (opacity = 1) => withAlpha(colors.gold, opacity),
                labelColor: () => colors.muted,
                propsForBackgroundLines: { stroke: colors.border },
                propsForDots: { r: '4', strokeWidth: '2', stroke: colors.gold },
              }}
              bezier
              style={styles.chart}
            />
          </View>
          {series.latestPace ? <Text style={styles.latest}>{t('progress.latestPace', { pace: formatPace(series.latestPace) })}</Text> : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={audit !== null} transparent animationType="fade" onRequestClose={() => setAudit(null)}>
        <View style={styles.auditBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAudit(null)} />
          <View style={styles.auditSheet}>
            <Text style={styles.auditTitle}>
              {audit === 'sessions' ? t('progress.auditSessionsTitle')
                : audit === 'volume' ? t('progress.auditVolumeTitle')
                  : t('progress.auditStreakTitle')}
            </Text>
            <Text style={styles.auditSubtitle}>
              {audit === 'sessions' ? t('progress.auditSessionsSubtitle', { total: summary?.workoutsCompleted ?? 0 })
                : audit === 'volume' ? t('progress.auditVolumeSubtitle', { total: formatNumber(summary?.totalVolume ?? 0) })
                  : t('progress.auditStreakSubtitle', { total: summary?.streak ?? 0 })}
            </Text>
            <ScrollView style={styles.auditList}>
              {auditRows.length === 0 ? (
                <Text style={styles.auditEmpty}>{t('progress.auditEmpty')}</Text>
              ) : auditRows.map((row) => (
                <View key={row.key} style={styles.auditRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditRowTitle}>{row.title}</Text>
                    <Text style={styles.auditRowDetail}>{row.detail}</Text>
                  </View>
                  <Text style={styles.auditRowValue}>{row.value}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setAudit(null)} style={styles.auditClose}>
              <Text style={styles.auditCloseText}>{t('progress.auditClose')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
    summaryHeader: { marginTop: spacing.lg, gap: 6 },
    summaryHeading: { color: colors.text, fontSize: 16, fontWeight: '800' },
    updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    updatedText: { color: colors.muted, fontSize: 12, fontWeight: '600', flex: 1 },
    refreshBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    statsMissing: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    statsMissingText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 96,
    },
    statLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    statValue: { color: colors.gold, fontSize: 22, fontWeight: '900', marginTop: 6 },
    statHint: { color: colors.muted, fontSize: 10, marginTop: 8 },
    streakHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
    picker: { gap: 8, paddingVertical: spacing.md },
    pick: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
    pickActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    pickText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
    pickTextActive: { color: colors.ink },
    selectedMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'capitalize' },
    chartCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingTop: spacing.md, marginTop: spacing.md, overflow: 'hidden' },
    chartLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, paddingHorizontal: spacing.md, marginBottom: 4 },
    ltr: { direction: 'ltr' },
    chart: { marginStart: -8 },
    latest: { color: colors.muted, fontSize: 12, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
    auditBackdrop: {
      flex: 1,
      backgroundColor: withAlpha('#000000', 0.62),
      justifyContent: 'flex-end',
    },
    auditSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      borderColor: colors.border,
      borderWidth: 1,
      maxHeight: '72%',
      padding: spacing.lg,
    },
    auditTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
    auditSubtitle: { color: colors.muted, fontSize: 13, marginTop: 6, marginBottom: spacing.md },
    auditList: { maxHeight: 360 },
    auditEmpty: { color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
    auditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    auditRowTitle: { color: colors.text, fontWeight: '700' },
    auditRowDetail: { color: colors.muted, fontSize: 12, marginTop: 2 },
    auditRowValue: { color: colors.gold, fontWeight: '900' },
    auditClose: {
      marginTop: spacing.md,
      minHeight: 44,
      borderRadius: radius.sm,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    auditCloseText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6 },
  });
}
