import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { coaches } from '../../services/api';
import { VideoEmbed } from '../../components/VideoEmbed';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage, formatNumber } from '../../../i18n';
import { VIDEO_REPORT_REASONS, type CoachVideo, type VideoReportReason } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow } from './coachUi';

export function CoachVideoPlayerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<CoachesStackParamList, 'CoachVideoPlayer'>>();
  const styles = useThemedStyles(createStyles);
  const [video, setVideo] = useState<CoachVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const videos = await coaches.videos(route.params.coachId);
      const found = videos.find((item) => item.id === route.params.videoId) ?? null;
      setVideo(found);
      if (!found) setError(t('coaches.videoNotFound'));
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [route.params.coachId, route.params.videoId, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!video) return;
    void coaches.recordView(video.id).then((result) => {
      setVideo((current) => current ? { ...current, viewCount: result.viewCount, uniqueViews: result.uniqueViews } : current);
    }).catch(() => undefined);
  }, [video?.id]);

  async function report(reason: VideoReportReason) {
    setError('');
    try {
      await coaches.reportVideo(route.params.videoId, reason);
      setInfo(t('coaches.reportThanks'));
      setReporting(false);
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.reportFailed')));
    }
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      {video ? (
        <>
          <VideoEmbed youtubeId={video.youtubeId} videoUrl={video.videoUrl} />
          <Text style={styles.title}>{video.title}</Text>
          <Text style={styles.meta}>{t('coaches.views', { n: formatNumber(video.uniqueViews) })}</Text>
          {video.description ? <Text style={styles.body}>{video.description}</Text> : null}
          <Pressable onPress={() => setReporting((open) => !open)} style={styles.textButton}>
            <Text style={styles.report}>{t('coaches.report')}</Text>
          </Pressable>
          {reporting ? (
            <View>
              <Text style={styles.meta}>{t('coaches.reportBody')}</Text>
              {VIDEO_REPORT_REASONS.map((reason) => (
                <Pressable key={reason} onPress={() => void report(reason)} style={styles.textButton}>
                  <Text style={styles.body}>{t(`coaches.reportReasons.${reason}`)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {info ? <Text style={styles.message}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    title: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: spacing.md },
    meta: { color: colors.muted, fontSize: 12, marginTop: 8 },
    body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
    textButton: { minHeight: 44, justifyContent: 'center', marginTop: spacing.md },
    report: { color: colors.danger, fontWeight: '700' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  });
}
