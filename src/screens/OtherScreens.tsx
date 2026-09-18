import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { auth, coachRequests, users } from '../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { LanguagePicker } from '../components/LanguagePicker';
import { ThemePicker } from '../components/ThemePicker';
import { ScreenSkeleton } from '../components/Skeleton';
import { AppDialog } from '../components/AppDialog';
import { apiErrorMessage } from '../../i18n';
import type { RootTabs } from '../navigation';
import type { CoachRequest, NotificationPrefs, Sex, UserRole, WeightUnit } from '../types/models';
import { DEFAULT_NOTIFICATION_PREFS } from '../types/models';
import {
  registerPushTokenWithServer,
  requestNotificationPermission,
  syncNotificationsForUser,
} from '../notifications';
import { displayToKg, formatWeightInput, kgToDisplay } from '../utils/weightUnits';

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

export function ProfileScreen({
  onLogout,
  onRoleChange,
}: {
  onLogout: () => void;
  onRoleChange?: (role: UserRole) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabs>>();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [weight, setWeight] = useState('');
  const [savedKg, setSavedKg] = useState<number | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('athlete');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
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
      setName(profile.name ?? '');
      setEmail(profile.email ?? '');
      setSavedKg(profile.weightKg);
      setWeightUnit(profile.weightUnit === 'lb' ? 'lb' : 'kg');
      setWeight(formatWeightInput(profile.weightKg, profile.weightUnit === 'lb' ? 'lb' : 'kg'));
      setAge(profile.age != null ? String(profile.age) : '');
      setSex(profile.sex ?? null);
      setHeightCm(profile.heightCm != null ? String(profile.heightCm) : '');
      setHasPassword(Boolean(profile.hasPassword));
      setRole(profile.role ?? 'athlete');
      setPrefs(profile.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS);
      onRoleChange?.(profile.role ?? 'athlete');
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
  }, [onRoleChange, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function switchUnit(next: WeightUnit) {
    if (next === weightUnit) return;
    const parsed = Number(weight.replace(',', '.'));
    if (Number.isFinite(parsed) && weight.trim() !== '') {
      const asKg = displayToKg(parsed, weightUnit);
      setWeight(formatWeightInput(asKg, next));
    } else if (savedKg != null) {
      setWeight(formatWeightInput(savedKg, next));
    }
    setWeightUnit(next);
  }

  async function savePersonalInfo() {
    const trimmedName = name.trim();
    if (trimmedName.length > 80) {
      setError(t('settings.invalidName'));
      return;
    }

    const weightN = Number(weight.replace(',', '.'));
    let weightKg: number | undefined;
    if (weight.trim() !== '') {
      if (!Number.isFinite(weightN) || weightN <= 0) {
        setError(t('settings.invalidWeight'));
        return;
      }
      weightKg = displayToKg(weightN, weightUnit);
      if (weightKg < 30 || weightKg > 400) {
        setError(t('settings.invalidWeight'));
        return;
      }
    }

    let ageValue: number | null | undefined;
    if (age.trim() === '') {
      ageValue = null;
    } else {
      const ageN = Number(age);
      if (!Number.isInteger(ageN) || ageN < 13 || ageN > 100) {
        setError(t('settings.invalidAge'));
        return;
      }
      ageValue = ageN;
    }

    let heightValue: number | null | undefined;
    if (heightCm.trim() === '') {
      heightValue = null;
    } else {
      const heightN = Number(heightCm.replace(',', '.'));
      if (!Number.isFinite(heightN) || heightN < 100 || heightN > 250) {
        setError(t('settings.invalidHeight'));
        return;
      }
      heightValue = heightN;
    }

    setSavingProfile(true);
    setError('');
    setMessage('');
    try {
      const profile = await users.updateMe({
        name: trimmedName,
        weightUnit,
        ...(weightKg !== undefined ? { weightKg } : {}),
        age: ageValue,
        sex,
        heightCm: heightValue,
      });
      setSavedKg(profile.weightKg);
      setWeight(formatWeightInput(profile.weightKg, profile.weightUnit));
      setWeightUnit(profile.weightUnit);
      setName(profile.name ?? '');
      setMessage(t('settings.profileSaved'));
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.saveFailed')));
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setError(t('settings.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('settings.passwordMismatch'));
      return;
    }
    setSavingPassword(true);
    setError('');
    setMessage('');
    try {
      await auth.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('settings.passwordChanged'));
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.passwordChangeFailed')));
    } finally {
      setSavingPassword(false);
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

  const unitLabel = weightUnit === 'lb' ? t('common.lb') : t('common.kg');
  const weightPlaceholder = savedKg != null
    ? String(Math.round(kgToDisplay(savedKg, weightUnit) * 10) / 10)
    : weightUnit === 'lb' ? '172' : '78';

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
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>{t('settings.eyebrow')}</Text>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Text style={styles.section}>{t('settings.personalInfo')}</Text>
        <Text style={styles.label}>{t('settings.displayName')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('settings.displayNamePlaceholder')}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>{t('settings.email')}</Text>
        <Text style={styles.readOnly}>{email || '—'}</Text>
        <Text style={styles.help}>{t('settings.emailReadOnlyHelp')}</Text>

        <Text style={styles.label}>{t('settings.weightUnit')}</Text>
        <View style={styles.chipRowFull}>
          {(['kg', 'lb'] as const).map((unit) => {
            const active = weightUnit === unit;
            return (
              <Pressable
                key={unit}
                onPress={() => switchUnit(unit)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {unit === 'kg' ? t('common.kg') : t('common.lb')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t('settings.bodyweight')} ({unitLabel})</Text>
        <Text style={styles.help}>{t('settings.help')}</Text>
        <TextInput
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          placeholder={weightPlaceholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>{t('settings.sex')}</Text>
        <View style={styles.chipRowFull}>
          {([
            { id: 'male' as const, label: t('nutrition.male') },
            { id: 'female' as const, label: t('nutrition.female') },
          ]).map((option) => {
            const active = sex === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setSex(option.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('settings.age')}</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="28"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t('settings.heightCm')}</Text>
            <TextInput
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="decimal-pad"
              placeholder="178"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.help}>{t('settings.anthropometricsHelp')}</Text>

        <Pressable
          onPress={() => void savePersonalInfo()}
          disabled={savingProfile}
          style={[styles.save, savingProfile && styles.disabled]}
        >
          {savingProfile
            ? <ActivityIndicator color={colors.ink} />
            : <Text style={styles.saveText}>{t('settings.saveProfile')}</Text>}
        </Pressable>

        <Text style={styles.section}>{t('settings.preferences')}</Text>
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

        <Text style={styles.section}>{t('settings.account')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.role')}</Text>
          <Text style={styles.value}>
            {role === 'coach' ? t('settings.roleCoach') : t('settings.roleAthlete')}
          </Text>
        </View>

        {hasPassword ? (
          <>
            <Text style={styles.label}>{t('settings.changePassword')}</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder={t('settings.currentPassword')}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder={t('settings.newPassword')}
              placeholderTextColor={colors.muted}
              style={[styles.input, { marginTop: spacing.sm }]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder={t('settings.confirmNewPassword')}
              placeholderTextColor={colors.muted}
              style={[styles.input, { marginTop: spacing.sm }]}
            />
            <Pressable
              onPress={() => void savePassword()}
              disabled={savingPassword}
              style={[styles.secondarySave, savingPassword && styles.disabled]}
            >
              {savingPassword
                ? <ActivityIndicator color={colors.text} />
                : <Text style={styles.secondarySaveText}>{t('settings.updatePassword')}</Text>}
            </Pressable>
          </>
        ) : (
          <Text style={styles.help}>{t('settings.signedInWithGoogle')}</Text>
        )}

        <Text style={styles.section}>{t('settings.coach')}</Text>
        {role === 'coach' ? (
          <>
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
            <Pressable onPress={() => navigation.navigate('Coaches', { screen: 'BecomeCoach' })} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t('settings.becomeCoach')}</Text>
                <Text style={styles.rowHint}>{t('settings.becomeCoachHelp')}</Text>
              </View>
              <Text style={styles.value}>{t('common.open')}</Text>
            </Pressable>
          </>
        )}

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

/** @deprecated Use ProfileScreen */
export const SettingsScreen = ProfileScreen;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    row: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center', gap: 12 },
    rowLabel: { color: colors.text, fontSize: 16, flex: 1 },
    rowHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    value: { color: colors.muted, fontWeight: '700' },
    section: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 7 },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: spacing.sm },
    readOnly: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      color: colors.text,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      textAlignVertical: 'center',
      paddingVertical: 14,
    },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md },
    fieldRow: { flexDirection: 'row', gap: spacing.sm },
    field: { flex: 1 },
    save: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md },
    saveText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6 },
    secondarySave: {
      minHeight: 48,
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
      borderRadius: radius.md,
    },
    secondarySaveText: { color: colors.text, fontWeight: '900', letterSpacing: 0.6 },
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
    chipRowFull: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
