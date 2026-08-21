import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LineChart } from 'react-native-chart-kit';
import { useTranslation } from 'react-i18next';
import { exercises as exercisesApi, workouts } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage, formatNumber } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { Exercise, ExerciseProgress } from '../types/models';

const chartWidth = Dimensions.get('window').width - spacing.lg * 2;

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

export function ProgressScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabs, 'Progress'>>();
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExerciseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedRef = useRef<string | null>(null);

  const load = useCallback(async (preferredId?: string | null) => {
    try {
      setError('');
      const list = await exercisesApi.getAll();
      setLibrary(list);
      const nextId = (preferredId && list.some((item) => item.id === preferredId)) ? preferredId : list[0]?.id ?? null;
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
  }, [t]);

  useFocusEffect(useCallback(() => { void load(selectedRef.current); }, [load]));

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

  if (loading) return <ScreenSkeleton variant="chart" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('progress.eyebrow')}</Text>
      <Text style={styles.title}>{t('progress.title')}</Text>
      <Text style={styles.subtitle}>{t('progress.subtitle')}</Text>
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
      {!chartLoading && progress && progress.points.length < 2 ? (
        <EmptyState title={t('progress.emptyTitle')} hint={t('progress.emptyHint')} />
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
                color: (opacity = 1) => `rgba(201, 167, 91, ${opacity})`,
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
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
});
