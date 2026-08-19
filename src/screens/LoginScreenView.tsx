import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../services/authApi';
import { colors, spacing } from '../theme';

type Props = { onAuthenticated: () => void };
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function errorMessage(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Email ou mot de passe incorrect.';
  if (status === 409) return 'Un compte existe deja avec cet email.';
  if (status === 429) return 'Trop de tentatives. Reessayez plus tard.';
  if ((error as { response?: unknown })?.response) return 'Atlas a refuse la demande. Verifiez sa configuration.';
  return 'Connexion impossible. Verifiez votre reseau puis reessayez.';
}

export function LoginScreen({ onAuthenticated }: Props) {
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
    if (!validEmail(email)) return showError('Entrez une adresse email valide.');
    if (password.length < 8) return showError('Le mot de passe doit contenir au moins 8 caracteres.');
    if (mode === 'signup' && password !== confirmation) return showError('Les mots de passe ne correspondent pas.');
    setLoading(true);
    try {
      if (mode === 'login') await authApi.login(email.trim(), password);
      else await authApi.register(email.trim(), password);
      onAuthenticated();
    } catch (requestError) {
      showError(errorMessage(requestError));
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
          <Text style={styles.tagline}>DISCIPLINE. REPETITION. PROGRESS.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.kicker}>TRAINING CARD 01</Text>
            <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Start your log'}</Text>
            <Text style={styles.subtitle}>{mode === 'login' ? 'Pick up where you left off.' : 'Build a stronger record, one set at a time.'}</Text>
          </View>
          <View style={styles.switcher}>
            <Pressable onPress={() => { setMode('login'); setError(''); }} style={[styles.switch, mode === 'login' && styles.switchActive]}><Text style={[styles.switchText, mode === 'login' && styles.switchTextActive]}>LOG IN</Text></Pressable>
            <Pressable onPress={() => { setMode('signup'); setError(''); }} style={[styles.switch, mode === 'signup' && styles.switchActive]}><Text style={[styles.switchText, mode === 'signup' && styles.switchTextActive]}>SIGN UP</Text></Pressable>
          </View>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} editable={!loading} />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} editable={!loading} />
          {mode === 'signup' && <>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Repeat your password" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} editable={!loading} />
          </>}
        </View>
        <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Animated.View>
        <Pressable onPress={submit} disabled={loading} style={[styles.submit, loading && styles.submitDisabled]}>
          {loading ? <ActivityIndicator color={colors.ink} /> : <><Text style={styles.submitText}>{mode === 'login' ? 'ENTER THE LOG' : 'CREATE ACCOUNT'}</Text><Ionicons name="arrow-forward" size={20} color={colors.ink} /></>}
        </Pressable>
        <Text style={styles.footnote}>Your training data stays private to your account.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg }, brand: { alignItems: 'center', marginBottom: spacing.lg }, logo: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, brandName: { color: colors.gold, fontSize: 26, fontWeight: '900', letterSpacing: 4 }, tagline: { color: colors.muted, fontSize: 9, letterSpacing: 2, marginTop: 6 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4, padding: spacing.lg }, cardHeader: { borderLeftColor: colors.gold, borderLeftWidth: 3, paddingLeft: spacing.sm, marginBottom: spacing.lg }, kicker: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, title: { color: colors.text, fontSize: 29, fontWeight: '900', marginTop: 8 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 }, switcher: { flexDirection: 'row', backgroundColor: colors.background, padding: 4, marginBottom: spacing.lg }, switch: { flex: 1, paddingVertical: 11, alignItems: 'center' }, switchActive: { backgroundColor: colors.gold }, switchText: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, switchTextActive: { color: colors.ink }, label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm }, input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 13, fontSize: 15, borderRadius: 3 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, textAlign: 'center' }, submit: { minHeight: 52, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: spacing.md, borderRadius: 3 }, submitDisabled: { opacity: 0.65 }, submitText: { color: colors.ink, fontWeight: '900', letterSpacing: 1 }, footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: spacing.md },
});