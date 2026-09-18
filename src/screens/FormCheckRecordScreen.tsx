import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog } from '../components/AppDialog';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { TodayStackParamList } from '../navigation';

const MAX_DURATION_SEC = 60;
const WHATSAPP_URL = 'whatsapp://';
const WHATSAPP_INSTALL = 'https://whatsapp.com/download';

type Nav = NativeStackNavigationProp<TodayStackParamList, 'FormCheckRecord'>;
type ScreenRoute = RouteProp<TodayStackParamList, 'FormCheckRecord'>;
type Phase = 'record' | 'preview';

async function deleteTemp(uri: string | null) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore cleanup failures
  }
}

async function stashInCache(sourceUri: string): Promise<string> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return sourceUri;
  const dest = `${cacheRoot}form-check-${Date.now()}.mp4`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    await deleteTemp(sourceUri);
    return dest;
  } catch {
    return sourceUri;
  }
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function FormCheckRecordScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ScreenRoute>();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [phase, setPhase] = useState<Phase>('record');
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [whatsAppMissing, setWhatsAppMissing] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoUriRef = useRef<string | null>(null);

  const setUri = useCallback((uri: string | null) => {
    videoUriRef.current = uri;
    setVideoUri(uri);
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      void deleteTemp(videoUriRef.current);
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    setElapsed(0);
    tickRef.current = setInterval(() => {
      setElapsed((n) => Math.min(n + 1, MAX_DURATION_SEC));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [recording]);

  async function ensurePermissions() {
    let cam = cameraPermission;
    let mic = micPermission;
    if (!cam?.granted) cam = await requestCameraPermission();
    if (!mic?.granted) mic = await requestMicPermission();
    return Boolean(cam?.granted && mic?.granted);
  }

  async function startRecording() {
    if (!cameraRef.current || recording) return;
    setError('');
    const ok = await ensurePermissions();
    if (!ok) {
      setError(t('formCheck.permissionDenied'));
      return;
    }
    try {
      setRecording(true);
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      });
      setRecording(false);
      if (!result?.uri) {
        setError(t('formCheck.recordFailed'));
        return;
      }
      const stored = await stashInCache(result.uri);
      setUri(stored);
      setPhase('preview');
    } catch {
      setRecording(false);
      setError(t('formCheck.recordFailed'));
    }
  }

  function stopRecording() {
    if (!cameraRef.current || !recording) return;
    cameraRef.current.stopRecording();
  }

  async function retake() {
    await deleteTemp(videoUri);
    setUri(null);
    setElapsed(0);
    setError('');
    setPhase('record');
  }

  async function sendToCoach() {
    if (!videoUri || sharing) return;
    setSharing(true);
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const hasWhatsApp = await Linking.canOpenURL(WHATSAPP_URL);
        if (!hasWhatsApp) {
          setWhatsAppMissing(true);
          setSharing(false);
          return;
        }
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError(t('formCheck.shareUnavailable'));
        setSharing(false);
        return;
      }
      await Sharing.shareAsync(videoUri, {
        mimeType: 'video/mp4',
        UTI: 'public.movie',
        dialogTitle: t('formCheck.shareDialogTitle', { name: params.exerciseName }),
      });
      await deleteTemp(videoUri);
      setUri(null);
      navigation.goBack();
    } catch {
      setError(t('formCheck.shareFailed'));
    } finally {
      setSharing(false);
    }
  }

  const permissionReady = cameraPermission?.granted && micPermission?.granted;

  if (!cameraPermission || !micPermission) {
    return <View style={styles.screen} />;
  }

  if (!permissionReady) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="videocam-outline" size={40} color={colors.gold} />
        <Text style={styles.title}>{t('formCheck.permissionTitle')}</Text>
        <Text style={styles.help}>{t('formCheck.permissionBody')}</Text>
        <Pressable
          onPress={() => void ensurePermissions()}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{t('formCheck.allowAccess')}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AppDialog
        visible={whatsAppMissing}
        title={t('formCheck.whatsappMissingTitle')}
        body={t('formCheck.whatsappMissingBody')}
        confirmLabel={t('formCheck.installWhatsapp')}
        cancelLabel={t('common.close')}
        tone="default"
        icon="logo-whatsapp"
        onCancel={() => setWhatsAppMissing(false)}
        onConfirm={() => {
          setWhatsAppMissing(false);
          void Linking.openURL(WHATSAPP_INSTALL);
        }}
      />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconHit} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{t('formCheck.kicker')}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{params.exerciseName}</Text>
          {params.coachName ? (
            <Text style={styles.headerMeta}>{t('formCheck.forCoach', { name: params.coachName })}</Text>
          ) : null}
        </View>
      </View>

      {phase === 'record' ? (
        <View style={styles.cameraWrap}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            mode="video"
            videoQuality="720p"
            mute={false}
          />
          <View style={styles.overlayTop}>
            <Text style={styles.timer}>
              {formatElapsed(elapsed)} / {formatElapsed(MAX_DURATION_SEC)}
            </Text>
          </View>
          <View style={[styles.overlayBottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
              style={styles.sideButton}
              disabled={recording}
            >
              <Ionicons name="camera-reverse-outline" size={26} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => (recording ? stopRecording() : void startRecording())}
              style={[styles.recordButton, recording && styles.recordButtonActive]}
            >
              <View style={[styles.recordInner, recording && styles.recordInnerActive]} />
            </Pressable>
            <View style={styles.sideButton} />
          </View>
        </View>
      ) : (
        <View style={styles.previewWrap}>
          {videoUri ? (
            <Video
              source={{ uri: videoUri }}
              style={styles.previewVideo}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
              isLooping
            />
          ) : null}
          <Text style={styles.previewHint}>{t('formCheck.previewHint')}</Text>
          <View style={[styles.previewActions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable onPress={() => void retake()} style={styles.secondary} disabled={sharing}>
              <Ionicons name="refresh" size={18} color={colors.gold} />
              <Text style={styles.secondaryText}>{t('formCheck.retake')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void sendToCoach()}
              style={[styles.primary, sharing && styles.disabled]}
              disabled={sharing}
            >
              <Ionicons name="share-outline" size={18} color={colors.ink} />
              <Text style={styles.primaryText}>
                {sharing ? t('common.loading') : t('formCheck.sendToCoach')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    iconHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    headerMeta: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 2 },
    title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.md },
    help: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.md },
    cameraWrap: { flex: 1, marginHorizontal: spacing.md, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
    camera: { flex: 1 },
    overlayTop: {
      position: 'absolute',
      top: spacing.md,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    timer: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 14,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    overlayBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sideButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    recordButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 4,
      borderColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordButtonActive: { borderColor: colors.danger },
    recordInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.danger },
    recordInnerActive: { width: 28, height: 28, borderRadius: radius.sm },
    previewWrap: { flex: 1, paddingHorizontal: spacing.md },
    previewVideo: {
      flex: 1,
      backgroundColor: '#000',
      borderRadius: radius.md,
      overflow: 'hidden',
      minHeight: 280,
    },
    previewHint: { color: colors.muted, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.sm },
    previewActions: { gap: spacing.sm },
    primary: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: spacing.md,
    },
    primaryText: { color: colors.ink, fontWeight: '900' },
    secondary: {
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: spacing.md,
    },
    secondaryText: { color: colors.gold, fontWeight: '800' },
    textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
    textButtonLabel: { color: colors.muted, fontWeight: '700' },
    error: { color: colors.danger, textAlign: 'center', padding: spacing.md, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
