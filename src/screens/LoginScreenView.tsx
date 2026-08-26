import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, I18nManager, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { auth } from '../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { LanguagePicker } from '../components/LanguagePicker';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { isGoogleAuthConfigured, useGoogleIdToken } from '../hooks/useGoogleIdToken';
import { apiErrorMessage } from '../../i18n';
import { COACH_SPECIALTIES, type ContactPreference, type UserRole } from '../types/models';
import { CoachChip } from './coaches/coachUi';

type Props = { onAuthenticated: (role: UserRole) => void };
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const PREFS: ContactPreference[] = ['app', 'email', 'phone'];

export function LoginScreen({ onAuthenticated }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [role, setRole] = useState<UserRole>('athlete');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [certifications, setCertifications] = useState('');
  const [contactPreference, setContactPreference] = useState<ContactPreference>('app');
  const [coachEmail, setCoachEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const showGoogle = mode === 'login' || role === 'athlete';

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
    if (mode === 'signup' && role === 'coach') {
      if (displayName.trim().length < 2) return showError(t('login.coachNameRequired'));
      if (bio.trim().length < 10) return showError(t('login.coachBioRequired'));
      if (specialties.length < 1) return showError(t('login.coachSpecialtyRequired'));
    }
    setLoading(true);
    try {
      const session = mode === 'login'
        ? await auth.login(email.trim(), password)
        : await auth.register(email.trim(), password, role === 'coach' ? {
          role: 'coach',
          coachProfile: {
            displayName: displayName.trim(),
            bio: bio.trim(),
            specialties,
            certifications: certifications.trim(),
            contactPreference,
            email: (coachEmail.trim() || email.trim()),
            phone: phone.trim(),
          },
        } : { role: 'athlete' });
      onAuthenticated(session.role);
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
            <Text style={styles.label}>{t('login.accountType')}</Text>
            <View style={styles.switcher}>
              <Pressable onPress={() => setRole('athlete')} style={[styles.switch, role === 'athlete' && styles.switchActive]}>
                <Text style={[styles.switchText, role === 'athlete' && styles.switchTextActive]} numberOfLines={2}>{t('login.roleAthlete')}</Text>
              </Pressable>
              <Pressable onPress={() => setRole('coach')} style={[styles.switch, role === 'coach' && styles.switchActive]}>
                <Text style={[styles.switchText, role === 'coach' && styles.switchTextActive]} numberOfLines={2}>{t('login.roleCoach')}</Text>
              </Pressable>
            </View>
            {role === 'coach' ? (
              <>
                <Text style={styles.hint}>{t('login.coachSignupHint')}</Text>
                <Text style={styles.label}>{t('coaches.displayName')}</Text>
                <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t('coaches.displayNamePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} editable={!loading} />
                <Text style={styles.label}>{t('coaches.bio')}</Text>
                <TextInput value={bio} onChangeText={setBio} placeholder={t('coaches.bioPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline editable={!loading} />
                <Text style={styles.label}>{t('coaches.specialtiesLabel')}</Text>
                <View style={styles.chipRow}>
                  {COACH_SPECIALTIES.map((item) => (
                    <CoachChip
                      key={item}
                      label={t(`coaches.specialties.${item}`)}
                      active={specialties.includes(item)}
                      onPress={() => setSpecialties((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item].slice(0, 8))}
                    />
                  ))}
                </View>
                <Text style={styles.label}>{t('coaches.certifications')} ({t('common.optional')})</Text>
                <TextInput value={certifications} onChangeText={setCertifications} placeholder={t('coaches.certificationsPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} editable={!loading} />
                <Text style={styles.label}>{t('coaches.contactPreference')}</Text>
                <View style={styles.chipRow}>
                  {PREFS.map((pref) => (
                    <CoachChip key={pref} label={t(`coaches.pref.${pref}`)} active={contactPreference === pref} onPress={() => setContactPreference(pref)} />
                  ))}
                </View>
                {contactPreference === 'email' ? (
                  <>
                    <Text style={styles.label}>{t('coaches.contactEmail')}</Text>
                    <TextInput value={coachEmail} onChangeText={setCoachEmail} autoCapitalize="none" keyboardType="email-address" placeholder={email || t('login.emailPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} editable={!loading} />
                  </>
                ) : null}
                {contactPreference === 'phone' ? (
                  <>
                    <Text style={styles.label}>{t('coaches.contactPhone')}</Text>
                    <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={t('coaches.phonePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} editable={!loading} />
                  </>
                ) : null}
              </>
            ) : <Text style={styles.hint}>{t('login.athleteSignupHint')}</Text>}
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
        {showGoogle ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('login.or')}</Text>
              <View style={styles.dividerLine} />
            </View>
            <GoogleAuthButton
              loading={loading}
              onAuthenticated={onAuthenticated}
              onError={showError}
              onStart={() => setError('')}
              onLoadingChange={setLoading}
            />
          </>
        ) : null}
        <Text style={styles.footnote}>{t('login.footnote')}</Text>
        <LanguagePicker compact />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoogleAuthButton({
  loading,
  onAuthenticated,
  onError,
  onStart,
  onLoadingChange,
}: {
  loading: boolean;
  onAuthenticated: (role: UserRole) => void;
  onError: (message: string) => void;
  onStart: () => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const configured = isGoogleAuthConfigured();

  const handleIdToken = useCallback(async (idToken: string) => {
    onLoadingChange(true);
    try {
      const session = await auth.loginWithGoogle(idToken);
      onAuthenticated(session.role);
    } catch (requestError) {
      onError(apiErrorMessage(requestError, t('login.googleFailed')));
    } finally {
      onLoadingChange(false);
    }
  }, [onAuthenticated, onError, onLoadingChange, t]);

  const handleAuthError = useCallback((message?: string) => {
    onError(message || t('login.googleFailed'));
  }, [onError, t]);

  if (!configured) {
    return (
      <GoogleSignInButton
        label={t('login.continueWithGoogle')}
        disabled={loading}
        onPress={() => onError(t('login.googleNotConfigured'))}
      />
    );
  }

  return (
    <GoogleAuthConfigured
      loading={loading}
      language={i18n.language}
      label={t('login.continueWithGoogle')}
      onIdToken={(idToken) => { void handleIdToken(idToken); }}
      onError={handleAuthError}
      onStart={onStart}
    />
  );
}

function GoogleAuthConfigured({
  loading,
  language,
  label,
  onIdToken,
  onError,
  onStart,
}: {
  loading: boolean;
  language?: string;
  label: string;
  onIdToken: (idToken: string) => void;
  onError: (message?: string) => void;
  onStart: () => void;
}) {
  const { ready, prompt } = useGoogleIdToken({ language, onIdToken, onError });
  return (
    <GoogleSignInButton
      label={label}
      loading={loading}
      disabled={!ready || loading}
      onPress={() => {
        onStart();
        void prompt();
      }}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
  multiline: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, textAlign: 'center' },
  submit: { minHeight: 52, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: spacing.md, borderRadius: radius.sm, paddingHorizontal: 12 },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  footnote: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
  });
}
