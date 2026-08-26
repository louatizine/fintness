import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppDialog } from '../components/AppDialog';
import { RouteMap } from '../components/RouteMap';
import { persistWorkoutSet, readStoredSession } from '../services/workoutSession';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { apiErrorMessage, formatNumber } from '../../i18n';
import {
  durationMinFromMs,
  formatClock,
  formatPace,
  pathDistanceKm,
  simplifyRoute,
  type RoutePoint,
} from '../utils/geo';
import { previewCaloriesBurned } from '../utils/metPreview';
import type { TodayStackParamList } from '../navigation';
import type { CardioIntensity } from '../types/models';

type Nav = NativeStackNavigationProp<TodayStackParamList, 'RunTracking'>;
type ScreenRoute = RouteProp<TodayStackParamList, 'RunTracking'>;

export function RunTrackingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ScreenRoute>();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'summary'>('idle');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [intensity, setIntensity] = useState<CardioIntensity>('moderate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointsRef = useRef<RoutePoint[]>([]);
  const allowLeave = useRef(false);

  useKeepAwake();

  const recording = phase === 'recording';
  const distanceKm = pathDistanceKm(points);
  const durationMin = durationMinFromMs(elapsedMs);
  const previewKcal = previewCaloriesBurned({
    seedKey: params.seedKey,
    intensity,
    weightKg: params.weightKg,
    durationMin,
  });

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => { pointsRef.current = points; }, [points]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === 'web') return;
      const existing = await Location.getForegroundPermissionsAsync();
      let granted = existing.status === 'granted';
      if (!granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        granted = asked.status === 'granted';
      }
      if (cancelled) return;
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      try {
        const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setPoints([{ lat: here.coords.latitude, lng: here.coords.longitude, timestamp: here.timestamp }]);
        }
      } catch { /* map fallback region */ }
    })();
    return () => { cancelled = true; stopWatch(); };
  }, [stopWatch]);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowLeave.current || phase === 'idle') return;
    event.preventDefault();
    setDiscardOpen(true);
  }), [navigation, phase]);

  async function startRecording() {
    setError('');
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 8 },
      (loc) => {
        setPoints((current) => [
          ...current,
          { lat: loc.coords.latitude, lng: loc.coords.longitude, timestamp: loc.timestamp },
        ]);
      }
    );
    watchRef.current = sub;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    tickRef.current = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);
    setPhase('recording');
  }

  function finishRecording() {
    stopWatch();
    if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    setPhase('summary');
  }

  async function save() {
    const track = pointsRef.current;
    const duration = durationMinFromMs(elapsedMs);
    const distance = pathDistanceKm(track);
    setSaving(true);
    setError('');
    try {
      const stored = await readStoredSession();
      const sessionId = stored?.dayKey === params.dayKey ? stored.sessionId : null;
      await persistWorkoutSet(
        {
          exerciseId: params.exerciseId,
          exerciseName: params.exerciseName,
          kind: 'cardio',
          setNumber: params.setNumber,
          durationMin: duration,
          distanceKm: distance > 0 ? Math.round(distance * 1000) / 1000 : null,
          intensity,
          completedAt: new Date().toISOString(),
          routePoints: simplifyRoute(track),
          distanceSource: 'gps',
        },
        {
          dayKey: params.dayKey,
          currentSessionId: sessionId,
          userProgramId: params.userProgramId,
          programId: params.programId,
          dayIndex: params.dayIndex,
          dayLabel: params.dayLabel,
        }
      );
      allowLeave.current = true;
      navigation.goBack();
    } catch (err) {
      setError(apiErrorMessage(err, t('tracking.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  function leave() {
    allowLeave.current = true;
    setDiscardOpen(false);
    stopWatch();
    navigation.goBack();
  }

  const title = params.seedKey === 'cycling' ? t('tracking.rideTitle') : t('tracking.runTitle');

  if (Platform.OS === 'web') {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{t('tracking.webUnsupported')}</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppDialog
        visible={discardOpen}
        title={t('tracking.discardTitle')}
        body={t('tracking.discardBody')}
        confirmLabel={t('tracking.discard')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        icon="trash-outline"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={leave}
      />
      <RouteMap points={points} followsUser={recording} />
      <View style={styles.topBar}>
        <Pressable onPress={() => (phase === 'idle' ? navigation.goBack() : setDiscardOpen(true))} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>{title}</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatClock(elapsedMs)}</Text>
          <Text style={styles.statLabel}>{t('tracking.time')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatNumber(distanceKm, { maximumFractionDigits: 2 })}</Text>
          <Text style={styles.statLabel}>{t('tracking.km')}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPace(durationMin, distanceKm)}</Text>
          <Text style={styles.statLabel}>{t('tracking.pace')}</Text>
        </View>
      </View>
      {permissionDenied ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('tracking.permissionDenied')}</Text>
          <Pressable onPress={() => void Linking.openSettings()} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>{t('tracking.openSettings')}</Text>
          </Pressable>
        </View>
      ) : null}
      {phase === 'summary' ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{t('tracking.summary')}</Text>
          <Text style={styles.kcal}>
            {typeof previewKcal === 'number'
              ? t('tracking.kcalPreview', { kcal: formatNumber(previewKcal) })
              : t('tracking.kcalUnavailable')}
          </Text>
          <Text style={styles.controlLabel}>{t('today.intensity')}</Text>
          <View style={styles.chipRow}>
            {(['low', 'moderate', 'high'] as const).map((level) => (
              <Pressable key={level} onPress={() => setIntensity(level)} style={[styles.chip, intensity === level && styles.chipOn]}>
                <Text style={[styles.chipText, intensity === level && styles.chipTextOn]}>
                  {t(`today.intensity${level[0].toUpperCase()}${level.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.footerError}>{error}</Text> : null}
      <View style={styles.actions}>
        {phase === 'idle' ? (
          <Pressable disabled={permissionDenied} onPress={() => void startRecording()} style={[styles.primary, permissionDenied && styles.disabled]}>
            <Text style={styles.primaryText}>{t('tracking.start')}</Text>
          </Pressable>
        ) : null}
        {phase === 'recording' ? (
          <Pressable onPress={finishRecording} style={styles.primary}>
            <Text style={styles.primaryText}>{t('tracking.finish')}</Text>
          </Pressable>
        ) : null}
        {phase === 'summary' ? (
          <Pressable disabled={saving} onPress={() => void save()} style={[styles.primary, saving && styles.disabled]}>
            <Text style={styles.primaryText}>{saving ? t('common.loading') : t('tracking.save')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    topBar: {
      position: 'absolute', top: 52, left: spacing.md, right: spacing.md,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    topTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
    stats: {
      position: 'absolute', left: spacing.md, right: spacing.md, bottom: 118, flexDirection: 'row',
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm,
    },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
    statLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
    banner: {
      position: 'absolute', left: spacing.md, right: spacing.md, top: 110,
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md,
    },
    bannerText: { color: colors.text, fontWeight: '700', marginBottom: spacing.sm },
    summary: {
      position: 'absolute', left: spacing.md, right: spacing.md, bottom: 200,
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md,
    },
    summaryTitle: { color: colors.gold, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
    kcal: { color: colors.text, fontWeight: '800', marginTop: 6 },
    controlLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: spacing.sm },
    chipRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
    chipText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
    chipTextOn: { color: colors.ink },
    actions: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.lg },
    primary: { minHeight: 52, backgroundColor: colors.gold, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: colors.ink, fontWeight: '900', fontSize: 16 },
    secondaryBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: colors.gold, fontWeight: '800' },
    error: { color: colors.danger, textAlign: 'center', fontWeight: '700' },
    footerError: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 80, color: colors.danger, textAlign: 'center', fontWeight: '700' },
    disabled: { opacity: 0.6 },
  });
}
