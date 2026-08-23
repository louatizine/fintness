import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { coachRequests, users } from '../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { LanguagePicker } from '../components/LanguagePicker';
import { ThemePicker } from '../components/ThemePicker';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { CoachRequest, UserRole } from '../types/models';

export function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabs>>();
  const [weight, setWeight] = useState('');
  const [savedKg, setSavedKg] = useState<number | null>(null);
  const [role, setRole] = useState<UserRole>('athlete');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeCoach, setActiveCoach] = useState<CoachRequest | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const profile = await users.getMe();
      setSavedKg(profile.weightKg);
      setWeight(profile.weightKg != null ? String(profile.weightKg) : '');
      setRole(profile.role ?? 'athlete');
      if ((profile.role ?? 'athlete') !== 'coach') {
        const sent = await coachRequests.sent();
        setActiveCoach(sent.find((item) => item.status === 'accepted') ?? null);
      } else {
        setActiveCoach(null);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function save() {
    const weightKg = Number(weight.replace(',', '.'));
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 400) {
      setError(t('settings.invalidWeight'));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const profile = await users.updateMe({ weightKg });
      setSavedKg(profile.weightKg);
      setMessage(t('settings.saved'));
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  function confirmRevoke() {
    if (!activeCoach) return;
    Alert.alert(
      t('settings.revokeTitle'),
      t('settings.revokeBody', { name: activeCoach.coachName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.revokeAccess'), style: 'destructive', onPress: () => void revoke() },
      ],
    );
  }

  async function revoke() {
    if (!activeCoach) return;
    setRevoking(true);
    setError('');
    setMessage('');
    try {
      await coachRequests.revoke(activeCoach.id);
      setActiveCoach(null);
      setMessage(t('settings.revoked'));
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.revokeFailed')));
    } finally {
      setRevoking(false);
    }
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('settings.eyebrow')}</Text>
      <Text style={styles.title}>{t('settings.title')}</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.weightUnit')}</Text>
        <Text style={styles.value}>{t('common.kg')}</Text>
      </View>
      <ThemePicker />
      <LanguagePicker />
      {role === 'coach' ? (
        <>
          <Text style={styles.section}>{t('settings.coach')}</Text>
          <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'CoachClients' })} style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.myClients')}</Text>
            <Text style={styles.value}>{t('common.open')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'CoachInbox' })} style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.coachInbox')}</Text>
            <Text style={styles.value}>{t('common.open')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'CoachVideoUpload' })} style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.uploadVideo')}</Text>
            <Text style={styles.value}>{t('common.open')}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'BecomeCoach' })} style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.editCoachProfile')}</Text>
            <Text style={styles.value}>{t('common.open')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.section}>{t('settings.coach')}</Text>
          {activeCoach ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('settings.activeCoach')}</Text>
                <Text style={styles.value}>{activeCoach.coachName}</Text>
              </View>
              <Pressable onPress={confirmRevoke} disabled={revoking} style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.danger }]}>{t('settings.revokeAccess')}</Text>
                <Text style={styles.value}>{revoking ? t('common.loading') : t('common.open')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.help}>{t('settings.noActiveCoach')}</Text>
          )}
          <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'CoachDirectory' })} style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.browseCoaches')}</Text>
            <Text style={styles.value}>{t('common.open')}</Text>
          </Pressable>
        </>
      )}
      <Text style={styles.section}>{t('settings.bodyweight')}</Text>
      <Text style={styles.help}>{t('settings.help')}</Text>
      <TextInput
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder={savedKg != null ? String(savedKg) : '78'}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.save, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>{t('settings.saveWeight')}</Text>}
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.section}>{t('settings.about')}</Text>
      <Pressable onPress={() => void Linking.openURL('https://github.com/yuhonas/free-exercise-db')} style={styles.attributionHit}>
        <Text style={styles.attribution}>{t('settings.attribution')}</Text>
      </Pressable>
      <Pressable onPress={onLogout} style={styles.logout}>
        <Text style={styles.logoutText}>{t('settings.logOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    row: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center' },
    rowLabel: { color: colors.text, fontSize: 16 },
    value: { color: colors.muted, fontWeight: '700' },
    section: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: spacing.sm },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md },
    save: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md },
    saveText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6 },
    disabled: { opacity: 0.65 },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    attributionHit: { minHeight: 44, justifyContent: 'center' },
    attribution: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, textDecorationLine: 'underline' },
    logout: { minHeight: 48, borderColor: colors.danger, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md },
    logoutText: { color: colors.danger, fontWeight: '900', letterSpacing: 0.6 },
  });
}
