import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { coaches, exercises as exercisesApi } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { Exercise } from '../../types/models';
import { CoachBackRow, CoachChip } from './coachUi';

export function CoachVideoUploadScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
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

  async function save() {
    if (!title.trim() || !videoUrl.trim()) {
      setError(t('coaches.videoRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await coaches.addVideo({
        title: title.trim(),
        description: description.trim(),
        videoUrl: videoUrl.trim(),
        exerciseTag: exerciseTag || undefined,
      });
      setInfo(t('coaches.videoSaved'));
      setTitle('');
      setDescription('');
      setVideoUrl('');
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
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.uploadEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.uploadVideo')}</Text>
      <Text style={styles.help}>{t('coaches.uploadHelp')}</Text>
      <Text style={styles.label}>{t('coaches.videoTitle')}</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder={t('coaches.videoTitlePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('coaches.videoUrl')}</Text>
      <TextInput
        value={videoUrl}
        onChangeText={setVideoUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('coaches.videoUrlPlaceholder')}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
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
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 7 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md },
    multiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primary: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
