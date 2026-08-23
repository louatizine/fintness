import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { users } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import { COACH_SPECIALTIES, type ContactPreference } from '../../types/models';
import { CoachBackRow, CoachChip } from './coachUi';

const PREFS: ContactPreference[] = ['app', 'email', 'phone'];

export function BecomeCoachScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [certifications, setCertifications] = useState('');
  const [contactPreference, setContactPreference] = useState<ContactPreference>('app');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const profile = await users.getMe();
      setEmail(profile.email);
      if (profile.role !== 'coach') {
        navigation.goBack();
        return;
      }
      if (profile.coachProfile) {
        setEditing(true);
        setDisplayName(profile.coachProfile.displayName);
        setBio(profile.coachProfile.bio);
        setSpecialties(profile.coachProfile.specialties);
        setCertifications(profile.coachProfile.certifications);
        setContactPreference(profile.coachProfile.contactPreference);
        setEmail(profile.coachProfile.email || profile.email);
        setPhone(profile.coachProfile.phone || '');
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function toggleSpecialty(item: string) {
    setSpecialties((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item].slice(0, 8));
  }

  async function save() {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await users.becomeCoach({
        displayName: displayName.trim(),
        bio: bio.trim(),
        specialties,
        certifications: certifications.trim(),
        contactPreference,
        email: email.trim(),
        phone: phone.trim(),
      });
      setInfo(t('coaches.profileSaved'));
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.becomeEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.editProfile')}</Text>
      <Text style={styles.help}>{t('coaches.editHelp')}</Text>
      <Text style={styles.label}>{t('coaches.displayName')}</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t('coaches.displayNamePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('coaches.bio')}</Text>
      <TextInput value={bio} onChangeText={setBio} placeholder={t('coaches.bioPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
      <Text style={styles.label}>{t('coaches.specialtiesLabel')}</Text>
      <View style={styles.chipRow}>
        {COACH_SPECIALTIES.map((item) => (
          <CoachChip key={item} label={t(`coaches.specialties.${item}`)} active={specialties.includes(item)} onPress={() => toggleSpecialty(item)} />
        ))}
      </View>
      <Text style={styles.label}>{t('coaches.certifications')} ({t('common.optional')})</Text>
      <TextInput value={certifications} onChangeText={setCertifications} placeholder={t('coaches.certificationsPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('coaches.contactPreference')}</Text>
      <View style={styles.chipRow}>
        {PREFS.map((pref) => (
          <CoachChip key={pref} label={t(`coaches.pref.${pref}`)} active={contactPreference === pref} onPress={() => setContactPreference(pref)} />
        ))}
      </View>
      {contactPreference === 'email' ? (
        <>
          <Text style={styles.label}>{t('coaches.contactEmail')}</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('login.emailPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
        </>
      ) : null}
      {contactPreference === 'phone' ? (
        <>
          <Text style={styles.label}>{t('coaches.contactPhone')}</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={t('coaches.phonePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
        </>
      ) : null}
      <Text style={styles.help}>{t('coaches.privacyNote')}</Text>
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('common.save')}</Text>}
      </Pressable>
      {info ? <Text style={styles.message}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 7 },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md },
    multiline: { minHeight: 120, paddingVertical: 12, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primary: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
