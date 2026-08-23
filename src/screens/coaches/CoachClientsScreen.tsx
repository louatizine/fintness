import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { coaches } from '../../services/api';
import { EmptyState } from '../../components/EmptyState';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage, formatDate } from '../../../i18n';
import type { CoachClientSummary } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow } from './coachUi';

function shortDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(date, { month: 'short', day: 'numeric' });
}

export function CoachClientsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const styles = useThemedStyles(createStyles);
  const [list, setList] = useState<CoachClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await coaches.clients());
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.clientsFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.clientsEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.myClients')}</Text>
      <Text style={styles.help}>{t('coaches.clientsHelp')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {list.length === 0 ? <EmptyState title={t('coaches.clientsEmptyTitle')} hint={t('coaches.clientsEmptyHint')} /> : null}
      {list.map((item) => {
        const started = shortDate(item.coachingStartedAt);
        const lastWorkout = shortDate(item.lastWorkoutAt);
        const adherence = item.plannedSessions > 0
          ? t('coaches.adherence', { done: item.completedSessions, planned: item.plannedSessions })
          : t('coaches.noPlanAdherence', { done: item.completedSessions });
        return (
          <Pressable
            key={item.athleteId}
            onPress={() => navigation.navigate('CoachClientDetail', { athleteId: item.athleteId, athleteLabel: item.name })}
            style={styles.card}
          >
            <Text style={styles.kicker}>{started ? t('coaches.coachingSince', { date: started }) : t('coaches.myClients')}</Text>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.meta}>{item.email}</Text>
            <Text style={styles.body}>{item.programName || t('coaches.noActivePlan')}</Text>
            <Text style={styles.meta}>{adherence}</Text>
            <Text style={styles.meta}>{lastWorkout ? t('coaches.lastWorkout', { date: lastWorkout }) : t('coaches.noWorkoutsYet')}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
    kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
    body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 8 },
    meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  });
}
