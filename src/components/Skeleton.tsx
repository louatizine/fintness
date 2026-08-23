import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';

function Pulse({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

export function ScreenSkeleton({ variant = 'list' }: { variant?: 'list' | 'chart' | 'rings' }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.screen}>
      <Pulse style={styles.eyebrow} />
      <Pulse style={styles.title} />
      {variant === 'rings' ? (
        <View style={styles.ringRow}>
          <Pulse style={styles.ring} />
          <Pulse style={styles.ring} />
          <Pulse style={styles.ring} />
        </View>
      ) : null}
      {variant === 'chart' ? <Pulse style={styles.chart} /> : null}
      <Pulse style={styles.card} />
      <Pulse style={styles.card} />
      <Pulse style={[styles.card, { height: 64 }]} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
    block: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
    eyebrow: { width: 72, height: 12, marginTop: spacing.sm },
    title: { width: 160, height: 28, marginTop: spacing.sm, marginBottom: spacing.md },
    ringRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
    ring: { width: 92, height: 92, borderRadius: 46 },
    chart: { height: 220, marginBottom: spacing.md },
    card: { height: 88, marginTop: spacing.sm },
  });
}
