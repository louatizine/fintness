import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme } from '../../theme';

export function CoachBackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
      <Ionicons name="chevron-back" size={20} color={colors.gold} />
      <Text style={{ color: colors.gold, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function CoachChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: 40,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: active ? colors.gold : colors.background,
        borderWidth: 1,
        borderColor: active ? colors.gold : colors.border,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: active ? colors.ink : colors.muted, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
