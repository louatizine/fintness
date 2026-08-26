import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { coachRequests, users } from '../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { LanguagePicker } from '../components/LanguagePicker';
import { ThemePicker } from '../components/ThemePicker';
import { ScreenSkeleton } from '../components/Skeleton';
import { AppDialog } from '../components/AppDialog';
import { apiErrorMessage } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { CoachRequest, NotificationPrefs, UserRole } from '../types/models';
import { DEFAULT_NOTIFICATION_PREFS } from '../types/models';
import {
  registerPushTokenWithServer,
  requestNotificationPermission,
  syncNotificationsForUser,
} from '../notifications';

const WATER_INTERVALS = [1, 2, 3, 4] as const;

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function stepHour(hour: number, delta: number): number {
  return (hour + delta + 24) % 24;
}

function stepMinute(minute: number, delta: number): number {
  const next = minute + delta;
  if (next < 0) return 45;
  if (next > 45) return 0;
  return next;
}

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
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeCoach, setActiveCoach] = useState<CoachRequest | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const askedPermissionRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const profile = await users.getMe();
      setSavedKg(profile.weightKg);
      setWeight(profile.weightKg != null ? String(profile.weightKg) : '');
      setRole(profile.role ?? 'athlete');
      setPrefs(profile.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS);
      if ((profile.role ?? 'athlete') !== 'coach') {
        const sent = await coachRequests.sent();
        setActiveCoach(sent.find((item) => item.status === 'accepted') ?? null);
      } else {
        setActiveCoach(null);
      }

      if (!askedPermissionRef.current) {
        askedPermissionRef.current = true;
        const granted = await requestNotificationPermission();
        if (granted) {
          await registerPushTokenWithServer();
          await syncNotificationsForUser(profile, { checkStreakNow: false });
        }
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

  async function persistPrefs(next: NotificationPrefs) {
    setPrefs(next);
    setSavingNotifs(true);
    setError('');
    setMessage('');
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setError(t('settings.notifPermissionDenied'));
      } else {
        await registerPushTokenWithServer();
      }
      const profile = await users.updateMe({ notificationPrefs: next });
      setPrefs(profile.notificationPrefs ?? next);
      await syncNotificationsForUser(profile, { checkStreakNow: false });
      setMessage(t('settings.notifSaved'));
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.notifSaveFailed')));
    } finally {
      setSavingNotifs(false);
    }
  }

  function confirmRevoke() {
    if (!activeCoach) return;
    setConfirmingRevoke(true);
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
    <>
      <AppDialog
        visible={confirmingRevoke}
        title={t('settings.revokeTitle')}
        body={activeCoach ? t('settings.revokeBody', { name: activeCoach.coachName }) : ''}
        confirmLabel={t('settings.revokeAccess')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        icon="person-remove-outline"
        onCancel={() => setConfirmingRevoke(false)}
        onConfirm={() => {
          setConfirmingRevoke(false);
          void revoke();
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{t('settings.eyebrow')}</Text>
        <Text style={styles.title}>{t('settings.title')}</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('settings.weightUnit')}</Text>
        <Text style={styles.value}>{t('common.kg')}</Text>
      </View>
      <ThemePicker />
      <LanguagePicker />

      <Text style={styles.section}>{t('settings.notifications')}</Text>
      <Text style={styles.help}>{t('settings.notificationsHelp')}</Text>
      {savingNotifs ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} /> : null}

      {role === 'athlete' ? (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.dailyMotivation')}</Text>
            <Switch
              value={prefs.dailyMotivation.enabled}
              onValueChange={(enabled) =>
                void persistPrefs({ ...prefs, dailyMotivation: { ...prefs.dailyMotivation, enabled } })
              }
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          {prefs.dailyMotivation.enabled ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.dailyMotivationTime')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() =>
                    void persistPrefs({
                      ...prefs,
                      dailyMotivation: {
                        ...prefs.dailyMotivation,
                        hour: stepHour(prefs.dailyMotivation.hour, -1),
                      },
                    })
                  }
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>
                  {formatTime(prefs.dailyMotivation.hour, prefs.dailyMotivation.minute)}
                </Text>
                <Pressable
                  onPress={() =>
                    void persistPrefs({
                      ...prefs,
                      dailyMotivation: {
                        ...prefs.dailyMotivation,
                        hour: stepHour(prefs.dailyMotivation.hour, 1),
                      },
                    })
                  }
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void persistPrefs({
                      ...prefs,
                      dailyMotivation: {
                        ...prefs.dailyMotivation,
                        minute: stepMinute(prefs.dailyMotivation.minute, -15),
                      },
                    })
                  }
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepBtnText}>−15m</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void persistPrefs({
                      ...prefs,
                      dailyMotivation: {
                        ...prefs.dailyMotivation,
                        minute: stepMinute(prefs.dailyMotivation.minute, 15),
                      },
                    })
                  }
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepBtnText}>+15m</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.streakAtRisk')}</Text>
            <Switch
              value={prefs.streakAtRisk.enabled}
              onValueChange={(enabled) =>
                void persistPrefs({ ...prefs, streakAtRisk: { enabled } })
              }
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.waterMeal')}</Text>
            <Switch
              value={prefs.waterMeal.enabled}
              onValueChange={(enabled) =>
                void persistPrefs({ ...prefs, waterMeal: { ...prefs.waterMeal, enabled } })
              }
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          {prefs.waterMeal.enabled ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.waterMealInterval')}</Text>
              <View style={styles.chipRow}>
                {WATER_INTERVALS.map((hours) => {
                  const active = prefs.waterMeal.intervalHours === hours;
                  return (
                    <Pressable
                      key={hours}
                      onPress={() =>
                        void persistPrefs({
                          ...prefs,
                          waterMeal: { ...prefs.waterMeal, intervalHours: hours },
                        })
                      }
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t('settings.intervalHours', { count: hours })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.coachRequestResponse')}</Text>
            <Switch
              value={prefs.coachRequestResponse.enabled}
              onValueChange={(enabled) =>
                void persistPrefs({ ...prefs, coachRequestResponse: { enabled } })
              }
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.planAssigned')}</Text>
            <Switch
              value={prefs.planAssigned.enabled}
              onValueChange={(enabled) =>
                void persistPrefs({ ...prefs, planAssigned: { enabled } })
              }
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.coachRequestReceived')}</Text>
          <Switch
            value={prefs.coachRequestReceived.enabled}
            onValueChange={(enabled) =>
              void persistPrefs({ ...prefs, coachRequestReceived: { enabled } })
            }
            trackColor={{ false: colors.border, true: colors.accent }}
          />
        </View>
      )}

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
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    row: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center', gap: 12 },
    rowLabel: { color: colors.text, fontSize: 16, flex: 1 },
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
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '58%' },
    stepBtn: {
      minHeight: 32,
      paddingHorizontal: 8,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '58%' },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
    chipText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
    chipTextActive: { color: colors.text },
  });
}
