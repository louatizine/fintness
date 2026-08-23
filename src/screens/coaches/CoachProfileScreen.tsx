import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { coachRequests, coaches, programs as programsApi, users } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage, formatNumber } from '../../../i18n';
import type { CoachContactInfo, CoachDetail, UserProfile } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow } from './coachUi';

export function CoachProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const route = useRoute<RouteProp<CoachesStackParamList, 'CoachProfile'>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [coach, setCoach] = useState<CoachDetail | null>(null);
  const [contact, setContact] = useState<CoachContactInfo | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [profile, detail] = await Promise.all([users.getMe().catch(() => null), coaches.get(route.params.coachId)]);
      setMe(profile);
      setCoach(detail);
      if (detail.myRequest?.status === 'accepted') {
        const revealed = await coachRequests.contactInfo(detail.myRequest.id).catch(() => null);
        setContact(revealed);
      } else {
        setContact(null);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [route.params.coachId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function sendRequest() {
    if (!message.trim()) {
      setError(t('coaches.messageRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await coaches.requestCoaching(route.params.coachId, message.trim());
      setInfo(t('coaches.requestSent'));
      setMessage('');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.requestFailed')));
    } finally {
      setSaving(false);
    }
  }

  async function usePlan(programId: string) {
    setAssigningId(programId);
    setError('');
    setInfo('');
    try {
      await programsApi.assign(programId);
      setInfo(t('coaches.planAssignedSelf'));
    } catch (err) {
      setError(apiErrorMessage(err, t('programs.assignFailed')));
    } finally {
      setAssigningId('');
    }
  }

  if (loading) return <ScreenSkeleton />;
  if (!coach) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error || t('coaches.notFound')}</Text>
      </ScrollView>
    );
  }

  const mine = me?.id === coach.id;
  const status = coach.myRequest?.status;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.profileEyebrow')}</Text>
      <Text style={styles.title}>{coach.displayName}</Text>
      <Text style={styles.meta}>{t('coaches.views', { n: formatNumber(coach.uniqueViews) })} · {t('coaches.videoCount', { n: formatNumber(coach.videoCount) })}</Text>
      <Text style={styles.body}>{coach.bio}</Text>
      <Text style={styles.section}>{t('coaches.specialtiesLabel')}</Text>
      <Text style={styles.meta}>{coach.specialties.map((item) => t(`coaches.specialties.${item}`, { defaultValue: item })).join(' · ')}</Text>
      {coach.certifications ? (
        <>
          <Text style={styles.section}>{t('coaches.certifications')}</Text>
          <Text style={styles.body}>{coach.certifications}</Text>
        </>
      ) : null}

      {!mine && status !== 'accepted' && status !== 'pending' ? (
        <View style={styles.card}>
          <Text style={styles.section}>{t('coaches.requestCoaching')}</Text>
          <Text style={styles.help}>{t('coaches.requestHelp')}</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t('coaches.requestPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.multiline]}
            multiline
          />
          <Pressable onPress={() => void sendRequest()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('coaches.sendRequest')}</Text>}
          </Pressable>
        </View>
      ) : null}
      {status === 'pending' ? <Text style={styles.message}>{t('coaches.requestPending')}</Text> : null}
      {status === 'accepted' ? (
        <View style={styles.card}>
          <Text style={styles.section}>{t('coaches.connected')}</Text>
          {contact?.method === 'email' && contact.email ? (
            <Pressable onPress={() => void Linking.openURL(`mailto:${contact.email}`)}>
              <Text style={styles.link}>{contact.email}</Text>
            </Pressable>
          ) : null}
          {contact?.method === 'phone' && contact.phone ? (
            <Pressable onPress={() => void Linking.openURL(`tel:${contact.phone}`)}>
              <Text style={styles.link}>{contact.phone}</Text>
            </Pressable>
          ) : null}
          {contact?.method === 'app' ? <Text style={styles.help}>{t('coaches.appContactHint')}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.section}>{t('coaches.plans')}</Text>
      <Text style={styles.help}>{t('coaches.plansHelp')}</Text>
      {(coach.programs ?? []).length === 0 ? <Text style={styles.help}>{t('coaches.noPlans')}</Text> : null}
      {(coach.programs ?? []).map((program) => (
        <View key={program.id} style={styles.card}>
          <Text style={styles.cardTitle}>{program.name}</Text>
          {program.description ? <Text style={styles.help}>{program.description}</Text> : null}
          <Text style={styles.meta}>{t('programs.daysPreview', { n: program.daysPerWeek, preview: program.days.map((day) => day.dayLabel).join(' · ') })}</Text>
          {!mine ? (
            <Pressable
              onPress={() => void usePlan(program.id)}
              disabled={Boolean(assigningId)}
              style={[styles.primary, assigningId === program.id && styles.disabled]}
            >
              {assigningId === program.id ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('coaches.useThisPlan')}</Text>}
            </Pressable>
          ) : null}
        </View>
      ))}

      <Text style={styles.section}>{t('coaches.videos')}</Text>
      {coach.videos.length === 0 ? <Text style={styles.help}>{t('coaches.noVideos')}</Text> : null}
      {coach.videos.map((video) => (
        <Pressable
          key={video.id}
          onPress={() => navigation.navigate('CoachVideoPlayer', { videoId: video.id, coachId: coach.id })}
          style={styles.videoCard}
        >
          {video.thumbnailUrl ? <Image source={{ uri: video.thumbnailUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{video.title}</Text>
            <Text style={styles.meta}>{t('coaches.views', { n: formatNumber(video.uniqueViews) })}</Text>
          </View>
        </Pressable>
      ))}
      {info ? <Text style={styles.message}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
    meta: { color: colors.muted, fontSize: 12, marginTop: 8 },
    section: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
    cardTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, marginTop: spacing.sm },
    multiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
    primary: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    videoCard: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
    thumb: { width: 96, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
    link: { color: colors.gold, fontWeight: '800', marginTop: 8, textDecorationLine: 'underline' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
