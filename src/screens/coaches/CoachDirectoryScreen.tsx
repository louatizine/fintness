import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { coaches, users } from '../../services/api';
import { EmptyState } from '../../components/EmptyState';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage, formatNumber } from '../../../i18n';
import { COACH_SPECIALTIES, type PublicCoach, type UserProfile } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow, CoachChip } from './coachUi';

export function CoachDirectoryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [list, setList] = useState<PublicCoach[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const filters = useRef({ query, specialty });
  filters.current = { query, specialty };

  const load = useCallback(async (nextPage = 1, append = false) => {
    const { query: q, specialty: spec } = filters.current;
    try {
      setError('');
      const [profile, result] = await Promise.all([
        users.getMe().catch(() => null),
        coaches.list({ page: nextPage, limit: 20, sort: 'rank', q: q.trim() || undefined, specialty: spec || undefined }),
      ]);
      setMe(profile);
      setTotal(result.total);
      setPage(result.page);
      setList((current) => (append ? [...current, ...result.coaches] : result.coaches));
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(1, false); }, [load, specialty]));

  async function search() {
    setLoading(true);
    await load(1, false);
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {navigation.canGoBack() ? <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} /> : null}
      <Text style={styles.eyebrow}>{t('coaches.eyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.title')}</Text>
      <Text style={styles.help}>{t('coaches.subtitle')}</Text>
      {me?.role === 'coach' ? (
        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate('CoachClients')} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t('coaches.myClients')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CoachInbox')} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t('coaches.inbox')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CoachVideoUpload')} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t('coaches.uploadVideo')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('BecomeCoach')} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t('coaches.editProfile')}</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void search()}
        placeholder={t('coaches.searchPlaceholder')}
        placeholderTextColor={colors.muted}
        style={styles.input}
        returnKeyType="search"
      />
      <View style={styles.chipRow}>
        <CoachChip label={t('common.all')} active={!specialty} onPress={() => { setSpecialty(''); setLoading(true); }} />
        {COACH_SPECIALTIES.map((item) => (
          <CoachChip
            key={item}
            label={t(`coaches.specialties.${item}`)}
            active={specialty === item}
            onPress={() => {
              setSpecialty((current) => (current === item ? '' : item));
              setLoading(true);
            }}
          />
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {list.length === 0 ? (
        <EmptyState title={t('coaches.emptyTitle')} hint={t('coaches.emptyHint')} />
      ) : list.map((coach) => (
        <Pressable key={coach.id} onPress={() => navigation.navigate('CoachProfile', { coachId: coach.id })} style={styles.card}>
          <Text style={styles.kicker}>{t('coaches.views', { n: formatNumber(coach.uniqueViews) })} · {t('coaches.videoCount', { n: formatNumber(coach.videoCount) })}</Text>
          <Text style={styles.cardTitle}>{coach.displayName}</Text>
          <Text style={styles.help} numberOfLines={3}>{coach.bio}</Text>
          <Text style={styles.meta}>{coach.specialties.map((item) => t(`coaches.specialties.${item}`, { defaultValue: item })).join(' · ')}</Text>
        </Pressable>
      ))}
      {list.length < total ? (
        <Pressable
          onPress={() => { setLoadingMore(true); void load(page + 1, true); }}
          disabled={loadingMore}
          style={[styles.secondary, loadingMore && styles.disabled]}
        >
          {loadingMore ? <ActivityIndicator color={colors.gold} /> : <Text style={styles.secondaryText}>{t('coaches.loadMore')}</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, marginTop: spacing.md },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
    kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
    meta: { color: colors.muted, fontSize: 12, marginTop: 8, textTransform: 'capitalize' },
    primary: { minHeight: 44, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    secondary: { minHeight: 44, borderColor: colors.gold, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.md },
    secondaryText: { color: colors.gold, fontWeight: '800' },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
