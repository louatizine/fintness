import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, I18nManager, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { auth } from '../services/api';
import { colors, radius, spacing } from '../theme';
import { LanguagePicker } from '../components/LanguagePicker';
import { apiErrorMessage } from '../../i18n';

type Props = { onAuthenticated: () => void };
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function LoginScreen({ onAuthenticated }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  function showError(message: string) {
    setError(message);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function submit() {
    setError('');
    if (!validEmail(email)) return showError(t('login.invalidEmail'));
    if (password.length < 8) return showError(t('login.passwordTooShort'));
    if (mode === 'signup' && password !== confirmation) return showError(t('login.passwordMismatch'));
    setLoading(true);
    try {
      if (mode === 'login') await auth.login(email.trim(), password);
      else await auth.register(email.trim(), password);
      onAuthenticated();
    } catch (requestError) {
      showError(apiErrorMessage(requestError, t('login.networkError')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}><Ionicons name="barbell" size={28} color={colors.ink} /></View>
          <Text style={styles.brandName}>FINTNESS</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.kicker}>{t('login.kicker')}</Text>
            <Text style={styles.title}>{mode === 'login' ? t('login.welcomeTitle') : t('login.signupTitle')}</Text>
            <Text style={styles.subtitle}>{mode === 'login' ? t('login.welcomeSubtitle') : t('login.signupSubtitle')}</Text>
          </View>
          <View style={styles.switcher}>
            <Pressable onPress={() => { setMode('login'); setError(''); }} style={[styles.switch, mode === 'login' && styles.switchActive]}>
              <Text style={[styles.switchText, mode === 'login' && styles.switchTextActive]} numberOfLines={2}>{t('login.logIn')}</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('signup'); setError(''); }} style={[styles.switch, mode === 'signup' && styles.switchActive]}>
              <Text style={[styles.switchText, mode === 'signup' && styles.switchTextActive]} numberOfLines={2}>{t('login.signUp')}</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>{t('login.email')}</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder={t('login.emailPlaceholder')} placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} editable={!loading} />
          <Text style={styles.label}>{t('login.password')}</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder={t('login.passwordPlaceholder')} placeholderTextColor={colors.muted} secureTextEntry style={styles.input} editable={!loading} />
          {mode === 'signup' && <>
            <Text style={styles.label}>{t('login.confirmPassword')}</Text>
            <TextInput value={confirmation} onChangeText={setConfirmation} placeholder={t('login.confirmPlaceholder')} placeholderTextColor={colors.muted} secureTextEntry style={styles.input} editable={!loading} />
          </>}
        </View>
        <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Animated.View>
        <Pressable onPress={submit} disabled={loading} style={[styles.submit, loading && styles.submitDisabled]}>
          {loading ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <Text style={styles.submitText} numberOfLines={2}>{mode === 'login' ? t('login.enterTheLog') : t('login.createAccount')}</Text>
              <Ionicons name={I18nManager.isRTL ? 'arrow-back' : 'arrow-forward'} size={20} color={colors.ink} />
            </>
          )}
        </Pressable>
        <Text style={styles.footnote}>{t('login.footnote')}</Text>
        <LanguagePicker compact />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.lg },
  logo: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  brandName: { color: colors.gold, fontSize: 26, fontWeight: '900', letterSpacing: 4 },
  tagline: { color: colors.muted, fontSize: 10, letterSpacing: 1.4, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  cardHeader: { borderStartColor: colors.gold, borderStartWidth: 3, paddingStart: spacing.sm, marginBottom: spacing.lg },
  kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  switcher: { flexDirection: 'row', backgroundColor: colors.background, padding: 4, marginBottom: spacing.lg, borderRadius: radius.sm },
  switch: { flex: 1, minHeight: 44, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: colors.gold },
  switchText: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center' },
  switchTextActive: { color: colors.ink },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 13, fontSize: 15, borderRadius: radius.sm },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, textAlign: 'center' },
  submit: { minHeight: 52, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: spacing.md, borderRadius: radius.sm, paddingHorizontal: 12 },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center' },
  footnote: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
