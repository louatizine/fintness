import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/** Official four-color Google G. Do not recolor. */
function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 18 18" accessibilityElementsHidden>
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </Svg>
  );
}

export function GoogleSignInButton({ label, onPress, disabled, loading }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={GOOGLE_TEXT} />
      ) : (
        <View style={styles.content}>
          <GoogleLogo />
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const GOOGLE_TEXT = '#1F1F1F';

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderColor: '#747775',
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  disabled: { opacity: 0.65 },
  pressed: { backgroundColor: '#F2F2F2' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    direction: 'ltr',
  },
  label: {
    color: GOOGLE_TEXT,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.15,
  },
});
