import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { users } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { UserProfile } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';

type Action = {
  screen: 'CoachClients' | 'CoachInbox' | 'CoachVideoUpload' | 'CoachNutritionPlanCreate' | 'BecomeCoach' | 'CoachDirectory';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  help: string;
};

export function CoachHomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const profile = await users.getMe();
      if (profile.role !== 'coach') {
        navigation.replace('CoachDirectory');
        return;
      }
      setMe(profile);
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenSkeleton />;

  const name = me?.coachProfile?.displayName || me?.email || '';
  const actions: Action[] = [
    { screen: 'CoachClients', icon: 'people-circle-outline', title: t('coaches.myClients'), help: t('coaches.spaceClientsHelp') },
    { screen: 'CoachInbox', icon: 'mail-outline', title: t('coaches.inbox'), help: t('coaches.spaceInboxHelp') },
    { screen: 'CoachVideoUpload', icon: 'videocam-outline', title: t('coaches.uploadVideo'), help: t('coaches.spaceUploadHelp') },
    { screen: 'CoachNutritionPlanCreate', icon: 'restaurant-outline', title: t('coaches.publicNutritionPlan'), help: t('coaches.spaceNutritionPlanHelp') },
    { screen: 'BecomeCoach', icon: 'person-outline', title: t('coaches.editProfile'), help: t('coaches.spaceProfileHelp') },
    { screen: 'CoachDirectory', icon: 'people-outline', title: t('coaches.browseDirectory'), help: t('coaches.spaceDirectoryHelp') },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('coaches.spaceEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.spaceTitle')}</Text>
      {name ? <Text style={styles.name}>{name}</Text> : null}
      <Text style={styles.help}>{t('coaches.spaceHelp')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {actions.map((action) => (
        <Pressable key={action.screen} onPress={() => navigation.navigate(action.screen)} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={action.icon} size={22} color={colors.gold} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardHelp}>{action.help}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gold} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
    name: { color: colors.gold, fontSize: 16, fontWeight: '800', marginTop: 8 },
    help: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 72,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardCopy: { flex: 1 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
    cardHelp: { color: colors.muted, fontSize: 13, marginTop: 4 },
  });
}
