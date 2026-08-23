import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { coachRequests } from '../../services/api';
import { EmptyState } from '../../components/EmptyState';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { CoachRequest } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow } from './coachUi';

export function CoachInboxScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const styles = useThemedStyles(createStyles);
  const [list, setList] = useState<CoachRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setList(await coachRequests.incoming());
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.inboxFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function respond(id: string, status: 'accepted' | 'declined') {
    setSavingId(id);
    setError('');
    try {
      const updated = await coachRequests.respond(id, status);
      setList((current) => current.map((item) => item.id === id ? updated : item));
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.respondFailed')));
    } finally {
      setSavingId('');
    }
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.inboxEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.inbox')}</Text>
      <Text style={styles.help}>{t('coaches.inboxHelp')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {list.length === 0 ? <EmptyState title={t('coaches.inboxEmptyTitle')} hint={t('coaches.inboxEmptyHint')} /> : null}
      {list.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.kicker}>{t(`coaches.status.${item.status}`)}</Text>
          <Text style={styles.cardTitle}>{item.athleteLabel}</Text>
          <Text style={styles.body}>{item.message}</Text>
          {item.status === 'pending' ? (
            <View style={styles.row}>
              <Pressable onPress={() => void respond(item.id, 'accepted')} disabled={Boolean(savingId)} style={[styles.primary, savingId === item.id && styles.disabled]}>
                {savingId === item.id ? <ActivityIndicator color="#17130d" /> : <Text style={styles.primaryText}>{t('common.accept')}</Text>}
              </Pressable>
              <Pressable onPress={() => void respond(item.id, 'declined')} disabled={Boolean(savingId)} style={styles.secondary}>
                <Text style={styles.secondaryText}>{t('common.decline')}</Text>
              </Pressable>
            </View>
          ) : null}
          {item.status === 'accepted' ? (
            <>
              <Pressable
                onPress={() => navigation.navigate('CoachClientDetail', { athleteId: item.athleteId, athleteLabel: item.athleteLabel })}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t('coaches.viewClient')}</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('AssignCoachProgram', { athleteId: item.athleteId, athleteLabel: item.athleteLabel })}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t('coaches.assignPlan')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ))}
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
    row: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
    primary: { flex: 1, minHeight: 44, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    secondary: { flex: 1, minHeight: 44, borderColor: colors.gold, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, marginTop: spacing.sm },
    secondaryText: { color: colors.gold, fontWeight: '800' },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
