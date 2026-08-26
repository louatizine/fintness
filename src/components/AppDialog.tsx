import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useTheme, useThemedStyles, withAlpha, type ThemeColors } from '../theme';

type DialogTone = 'default' | 'danger' | 'success';

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: DialogTone;
  icon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  icon,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const accent = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.gold;
  const glyph = icon ?? (tone === 'danger' ? 'warning-outline' : tone === 'success' ? 'checkmark-circle-outline' : 'help-circle-outline');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.dialog}>
          <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.42) }]}>
            <Ionicons name={glyph} size={26} color={accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.confirm, { backgroundColor: accent }]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: withAlpha('#000000', 0.62),
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.lg,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    iconWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '900', textAlign: 'center' },
    body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
    actions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg, width: '100%' },
    cancel: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    confirm: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    cancelText: { color: colors.text, fontSize: 13, fontWeight: '900', textAlign: 'center' },
    confirmText: { color: colors.ink, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  });
}
