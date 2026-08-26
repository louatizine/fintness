import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { coaches, exercises as exercisesApi } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { Exercise } from '../../types/models';
import { CoachBackRow, CoachChip } from './coachUi';

const MAX_VIDEO_DURATION_MS = 90_000;

type SelectedVideo = {
  uri: string;
  name: string;
  mimeType: string;
  durationMs: number;
  file?: File;
};

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function CoachVideoUploadScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [exerciseTag, setExerciseTag] = useState('');
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setLibrary(await exercisesApi.getAll());
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function pickVideo() {
    setError('');
    setInfo('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('coaches.videoPermissionRequired'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 90,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset || asset.type !== 'video') {
      setError(t('coaches.videoFileRequired'));
      return;
    }
    const durationMs = typeof asset.duration === 'number' ? asset.duration : 0;
    if (!durationMs) {
      setError(t('coaches.videoDurationUnknown'));
      return;
    }
    if (durationMs > MAX_VIDEO_DURATION_MS) {
      setError(t('coaches.videoTooLong'));
      return;
    }
    setVideo({
      uri: asset.uri,
      name: asset.fileName ?? `coach-video-${Date.now()}.mp4`,
      mimeType: asset.mimeType ?? 'video/mp4',
      durationMs,
      file: asset.file,
    });
  }

  async function save() {
    if (!title.trim() || !video) {
      setError(t('coaches.videoRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('durationMs', String(video.durationMs));
      if (exerciseTag) form.append('exerciseTag', exerciseTag);
      if (video.file) {
        form.append('video', video.file);
      } else {
        form.append('video', {
          uri: video.uri,
          name: video.name,
          type: video.mimeType,
        } as unknown as Blob);
      }
      await coaches.uploadVideo(form);
      setInfo(t('coaches.videoSaved'));
      setTitle('');
      setDescription('');
      setVideo(null);
      setExerciseTag('');
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.videoSaveFailed')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
        <Pressable onPress={() => navigation.navigate('CoachHome' as never)} style={styles.homeButton}>
          <Ionicons name="home-outline" size={18} color={colors.gold} />
          <Text style={styles.homeText}>{t('common.home')}</Text>
        </Pressable>
      </View>
      <Text style={styles.eyebrow}>{t('coaches.uploadEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.uploadVideo')}</Text>
      <Text style={styles.help}>{t('coaches.uploadHelp')}</Text>
      <Text style={styles.label}>{t('coaches.videoTitle')}</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder={t('coaches.videoTitlePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('coaches.videoFile')}</Text>
      <Pressable onPress={() => void pickVideo()} disabled={saving} style={styles.fileButton}>
        <Text style={styles.fileButtonText}>{video ? t('coaches.changeVideo') : t('coaches.chooseVideo')}</Text>
      </Pressable>
      {video ? (
        <View style={styles.fileSummary}>
          <Text style={styles.fileName} numberOfLines={1}>{video.name}</Text>
          <Text style={styles.fileMeta}>{t('coaches.videoDuration', { duration: formatDuration(video.durationMs) })}</Text>
        </View>
      ) : null}
      <Text style={styles.label}>{t('coaches.videoDescription')} ({t('common.optional')})</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder={t('coaches.videoDescriptionPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
      <Text style={styles.label}>{t('coaches.exerciseTag')} ({t('common.optional')})</Text>
      <View style={styles.chipRow}>
        <CoachChip label={t('common.all')} active={!exerciseTag} onPress={() => setExerciseTag('')} />
        {library.slice(0, 24).map((exercise) => (
          <CoachChip
            key={exercise.id}
            label={exercise.name}
            active={exerciseTag === exercise.id}
            onPress={() => setExerciseTag(exerciseTag === exercise.id ? '' : exercise.id)}
          />
        ))}
      </View>
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('coaches.publishVideo')}</Text>}
      </Pressable>
      {info ? <Text style={styles.message}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
    homeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginBottom: spacing.sm },
    homeText: { color: colors.gold, fontWeight: '800' },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 7 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md },
    fileButton: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    fileButtonText: { color: colors.text, fontWeight: '900' },
    fileSummary: { marginTop: spacing.sm, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
    fileName: { color: colors.text, fontSize: 13, fontWeight: '800' },
    fileMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
    multiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primary: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
