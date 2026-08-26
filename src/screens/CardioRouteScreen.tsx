import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type MapView from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { workouts } from '../services/api';
import { RouteMap } from '../components/RouteMap';
import { ScreenSkeleton } from '../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { apiErrorMessage, formatNumber } from '../../i18n';
import { formatPace, type RoutePoint } from '../utils/geo';
import type { HistoryStackParamList } from '../navigation';
import type { SetLog } from '../types/models';

type Nav = NativeStackNavigationProp<HistoryStackParamList, 'CardioRoute'>;
type ScreenRoute = RouteProp<HistoryStackParamList, 'CardioRoute'>;

export function CardioRouteScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ScreenRoute>();
  const mapRef = useRef<MapView>(null);
  const [set, setSet] = useState<SetLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        setError('');
        const session = await workouts.getById(params.sessionId);
        if (!alive) return;
        const found = (session.sets ?? []).find((item) => item.id === params.setId) ?? null;
        setSet(found);
        const pts = found?.routePoints ?? [];
        if (pts.length >= 2) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(
              pts.map((p) => ({ latitude: p.lat, longitude: p.lng })),
              { edgePadding: { top: 80, right: 40, bottom: 160, left: 40 }, animated: false }
            );
          }, 300);
        }
      } catch (err) {
        if (alive) setError(apiErrorMessage(err, t('tracking.routeLoadFailed')));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [params.sessionId, params.setId, t]));

  if (loading) return <ScreenSkeleton variant="list" />;

  const points: RoutePoint[] = set?.routePoints ?? [];
  const duration = set?.durationMin ?? 0;
  const distance = set?.distanceKm ?? 0;

  return (
    <View style={styles.screen}>
      <RouteMap ref={mapRef} points={points} />
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.card}>
        <Text style={styles.name}>{set?.exerciseName || t('history.cardio')}</Text>
        <Text style={styles.meta}>
          {t('tracking.routeStats', {
            duration: formatNumber(duration, { maximumFractionDigits: 1 }),
            distance: formatNumber(distance, { maximumFractionDigits: 2 }),
            pace: formatPace(duration, distance),
          })}
        </Text>
        {typeof set?.caloriesBurned === 'number' ? (
          <Text style={styles.meta}>{t('history.cardioCalories', { kcal: formatNumber(set.caloriesBurned) })}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    back: {
      position: 'absolute',
      top: 52,
      left: spacing.md,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.lg,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    name: { color: colors.text, fontSize: 18, fontWeight: '900' },
    meta: { color: colors.muted, marginTop: 6, fontWeight: '700' },
    error: { color: colors.danger, marginTop: 8 },
  });
}
