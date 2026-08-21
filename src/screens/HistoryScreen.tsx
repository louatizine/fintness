import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { workouts } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage, formatDate, formatNumber } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { WorkoutCalorieSummary, WorkoutSession } from '../types/models';

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
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

function cardioLine(session: WorkoutSession, t: (key: string, opts?: Record<string, unknown>) => string) {
  const cardioSets = (session.sets ?? []).filter((set) => set.kind === 'cardio');
  const cardioName = t('history.cardio');
  if (cardioSets.length === 0 && session.kinds?.includes('cardio')) {
    const duration = session.cardioDurationMin ?? 0;
    const calories = session.cardioCaloriesBurned;
    const names = session.exerciseNames?.join(', ') || cardioName;
    if (calories != null) return t('history.cardioLineKcal', { duration, name: names, kcal: formatNumber(calories) });
    return duration ? t('history.cardioLine', { duration, name: names }) : names;
  }
  if (cardioSets.length === 0) return null;
  if (cardioSets.length === 1) {
    const set = cardioSets[0];
    const name = set.exerciseName || cardioName;
    if (typeof set.caloriesBurned === 'number') {
      return t('history.cardioLineKcal', { duration: set.durationMin, name, kcal: formatNumber(set.caloriesBurned) });
    }
    return t('history.cardioLine', { duration: set.durationMin, name });
  }
  const parts = cardioSets.map((set) => t('history.cardioLine', { duration: set.durationMin, name: set.exerciseName || cardioName }));
  const calories = session.cardioCaloriesBurned;
  return typeof calories === 'number' ? `${parts.join(', ')} — ${formatNumber(calories)} kcal` : parts.join(', ');
}

export function HistoryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabs, 'History'>>();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [summary, setSummary] = useState<WorkoutCalorieSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      {sessions.length === 0 ? (
        <EmptyState
          title={t('history.emptyTitle')}
          hint={t('history.emptyHint')}
          ctaLabel={t('history.emptyCta')}
          onCta={() => navigation.navigate('Today')}
        />
      ) : (
        sessions.map((session) => {
          const id = session._id || session.id;
          const names = session.exerciseNames?.length ? session.exerciseNames.join(', ') : t('history.session');
          const kinds = session.kinds ?? [];
          const cardio = cardioLine(session, t);
          return (
            <View key={id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.when}>{formatWhen(session.startedAt)}{session.dayLabel ? ` · ${session.dayLabel.toUpperCase()}` : ''}</Text>
                <Text style={styles.names}>{names}</Text>
                {cardio ? <Text style={styles.volume}>{cardio}</Text> : null}
                {session.totalVolume ? (
                  <Text style={styles.volume}>{t('history.kgVolume', { volume: formatNumber(Math.round(session.totalVolume)) })}</Text>
                ) : null}
              </View>
              <View style={styles.badges}>
                {kinds.includes('strength') ? <Text style={styles.badge}>{t('history.strength')}</Text> : null}
                {kinds.includes('cardio') ? <Text style={styles.badge}>{t('history.cardioBadge')}</Text> : null}
              </View>
            </View>
          );
        })
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm, marginBottom: spacing.md },
  totals: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  totalCard: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  totalLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  totalValue: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 6 },
  totalUnit: { color: colors.muted, fontSize: 12, marginTop: 2 },
  row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  when: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  names: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
  volume: { color: colors.muted, fontSize: 12, marginTop: 4 },
  badges: { gap: 6, alignItems: 'flex-end' },
  badge: { color: colors.ink, backgroundColor: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
