import { forwardRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '../theme';
import type { RoutePoint } from '../utils/geo';

type Props = {
  points: RoutePoint[];
  followsUser?: boolean;
};

const FALLBACK = {
  latitude: 36.8,
  longitude: 10.18,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export const RouteMap = forwardRef<MapView, Props>(function RouteMap({ points, followsUser = false }, ref) {
  const { colors } = useTheme();
  if (Platform.OS === 'web') return <View style={styles.fill} />;
  const last = points[points.length - 1];
  const region = last
    ? { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : FALLBACK;
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return (
    <MapView
      ref={ref}
      style={styles.fill}
      provider={PROVIDER_GOOGLE}
      initialRegion={region}
      showsUserLocation
      followsUserLocation={followsUser}
      showsMyLocationButton={false}
      pitchEnabled={false}
    >
      {coords.length >= 2 ? (
        <Polyline coordinates={coords} strokeColor={colors.gold} strokeWidth={5} />
      ) : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
