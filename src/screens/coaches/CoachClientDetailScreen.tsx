import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { coaches, users } from '../../services/api';
import { ScreenSkeleton } from '../../components/Skeleton';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage, formatDate, formatNumber } from '../../../i18n';
import type { CoachClientDetail, NutritionGoalKind } from '../../types/models';
import type { CoachesStackParamList } from '../../navigation';
import { CoachBackRow, CoachChip } from './coachUi';

type Tab = 'info' | 'training' | 'nutrition' | 'history';

function shortDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(date, { month: 'short', day: 'numeric' });
}

export function CoachClientDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CoachesStackParamList>>();
  const route = useRoute<RouteProp<CoachesStackParamList, 'CoachClientDetail'>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [detail, setDetail] = useState<CoachClientDetail | null>(null);
  const [coachId, setCoachId] = useState('');
  const [tab, setTab] = useState<Tab>('info');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [water, setWater] = useState('');
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [mealPlan, setMealPlan] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [goal, setGoal] = useState<NutritionGoalKind>('maintain');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [me, client] = await Promise.all([
        users.getMe(),
        coaches.client(route.params.athleteId),
      ]);
      setCoachId(me.id);
      setDetail(client);
      if (client.nutritionPlan) {
        setPlanTitle(client.nutritionPlan.title);
        setPlanDescription(client.nutritionPlan.description);
        setCalories(String(client.nutritionPlan.dailyCalories));
        setProtein(String(client.nutritionPlan.dailyProtein));
        setCarbs(String(client.nutritionPlan.dailyCarbs));
        setFat(String(client.nutritionPlan.dailyFat));
        setWater(String(client.nutritionPlan.dailyWater));
        setGoal(client.nutritionPlan.goal);
        setMealPlan(client.nutritionPlan.mealPlan);
        setPlanNotes(client.nutritionPlan.notes);
      } else if (client.nutritionGoals) {
        setCalories(String(client.nutritionGoals.dailyCalories));
        setProtein(String(client.nutritionGoals.dailyProtein));
        setWater(String(client.nutritionGoals.dailyWater));
        setGoal(client.nutritionGoals.goal);
        setPlanTitle(t('coaches.clientNutritionPlanDefaultTitle', { name: route.params.athleteLabel }));
      }
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.clientFailed')));
    } finally {
      setLoading(false);
    }
  }, [route.params.athleteId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function saveNutrition() {
    const dailyCalories = Number(calories.replace(',', '.'));
    const dailyProtein = Number(protein.replace(',', '.'));
    const dailyCarbs = Number(carbs.replace(',', '.'));
    const dailyFat = Number(fat.replace(',', '.'));
    const dailyWater = Number(water.replace(',', '.'));
    if (!planTitle.trim() || !Number.isFinite(dailyCalories) || dailyCalories <= 0 || !Number.isFinite(dailyProtein) || dailyProtein < 0 || !Number.isFinite(dailyWater) || dailyWater <= 0) {
      setError(t('nutrition.planRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const nutritionPlan = await coaches.setClientNutritionPlan(route.params.athleteId, {
        title: planTitle.trim(),
        description: planDescription.trim(),
        dailyCalories,
        dailyProtein,
        dailyCarbs: Number.isFinite(dailyCarbs) ? dailyCarbs : 0,
        dailyFat: Number.isFinite(dailyFat) ? dailyFat : 0,
        dailyWater,
        goal,
        mealPlan: mealPlan.trim(),
        notes: planNotes.trim(),
      });
      setDetail((current) => (current ? {
        ...current,
        nutritionPlan,
        nutritionGoals: {
          dailyCalories: nutritionPlan.dailyCalories,
          dailyProtein: nutritionPlan.dailyProtein,
          dailyWater: nutritionPlan.dailyWater,
          goal: nutritionPlan.goal,
          source: 'coach',
          setByCoachId: nutritionPlan.coachId,
          setByCoachName: nutritionPlan.coachName,
          updatedAt: nutritionPlan.updatedAt,
        },
      } : current));
      setInfo(t('coaches.nutritionPlanSaved', { name: route.params.athleteLabel }));
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.nutritionPlanSaveFailed')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenSkeleton />;

  const goals = detail?.nutritionGoals;
  const nutritionPlan = detail?.nutritionPlan;
  const program = detail?.program;
  const ownsProgram = Boolean(program && program.createdByCoachId === coachId);
  const started = shortDate(detail?.coachingStartedAt ?? null);
  const lastWorkout = shortDate(detail?.adherence.lastWorkoutAt ?? null);
  const planned = detail?.adherence.plannedSessions ?? 0;
  const completed = detail?.adherence.completedSessions ?? 0;
  const sourceLabel = goals?.source === 'coach'
    ? t('coaches.goalsSourceCoach')
    : goals?.source === 'manual'
      ? t('coaches.goalsSourceAthlete')
      : t('coaches.goalsSourceAuto');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.clientEyebrow')}</Text>
      <Text style={styles.title}>{detail?.name || route.params.athleteLabel}</Text>
      {started ? <Text style={styles.help}>{t('coaches.coachingSince', { date: started })}</Text> : null}
      <View style={styles.chipRow}>
        <CoachChip label={t('coaches.tabInfo')} active={tab === 'info'} onPress={() => setTab('info')} />
        <CoachChip label={t('coaches.tabTraining')} active={tab === 'training'} onPress={() => setTab('training')} />
        <CoachChip label={t('coaches.tabNutrition')} active={tab === 'nutrition'} onPress={() => setTab('nutrition')} />
        <CoachChip label={t('coaches.tabHistory')} active={tab === 'history'} onPress={() => setTab('history')} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.message}>{info}</Text> : null}

      {tab === 'info' ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>{t('coaches.tabInfo')}</Text>
          <Text style={styles.cardTitle}>{detail?.email}</Text>
          <Text style={styles.body}>{t('coaches.weight')}: {detail?.weightKg != null ? `${formatNumber(detail.weightKg)} ${t('common.kg')}` : '—'}</Text>
          <Text style={styles.body}>{t('coaches.goalType')}: {goals ? t(`nutrition.${goals.goal}`) : '—'}</Text>
          <Text style={styles.meta}>{program?.name || t('coaches.noActivePlan')}</Text>
          <Text style={styles.meta}>{planned > 0 ? t('coaches.adherence', { done: completed, planned }) : t('coaches.noPlanAdherence', { done: completed })}</Text>
          <Text style={styles.meta}>{lastWorkout ? t('coaches.lastWorkout', { date: lastWorkout }) : t('coaches.noWorkoutsYet')}</Text>
        </View>
      ) : null}

      {tab === 'training' ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>{t('coaches.activePlan')}</Text>
          <Text style={styles.cardTitle}>{program?.name || t('coaches.noActivePlan')}</Text>
          {program?.days.map((day, index) => (
            <View key={`${day.dayLabel}-${index}`} style={styles.block}>
              <Text style={styles.slotName}>{day.dayLabel}</Text>
              {day.exercises.map((item) => (
                <Text key={item.exerciseId} style={styles.meta}>
                  {item.exerciseName || item.exerciseId} · {item.targetSets} × {item.targetRepMin}–{item.targetRepMax}
                </Text>
              ))}
            </View>
          ))}
          <Pressable
            onPress={() => navigation.navigate('AssignCoachProgram', {
              athleteId: route.params.athleteId,
              athleteLabel: route.params.athleteLabel,
              programId: ownsProgram ? program?.id : undefined,
            })}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{ownsProgram ? t('coaches.editPlan') : t('coaches.assignPlan')}</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === 'nutrition' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.kicker}>{t('coaches.currentNutritionPlan')}</Text>
            {nutritionPlan ? (
              <>
                <Text style={styles.cardTitle}>{nutritionPlan.title}</Text>
                {nutritionPlan.description ? <Text style={styles.body}>{nutritionPlan.description}</Text> : null}
                <Text style={styles.body}>
                  {t('coaches.nutritionPlanMacros', {
                    kcal: formatNumber(nutritionPlan.dailyCalories),
                    protein: formatNumber(nutritionPlan.dailyProtein),
                    carbs: formatNumber(nutritionPlan.dailyCarbs),
                    fat: formatNumber(nutritionPlan.dailyFat),
                    water: formatNumber(nutritionPlan.dailyWater),
                  })}
                </Text>
                {nutritionPlan.mealPlan ? <Text style={styles.meta}>{nutritionPlan.mealPlan}</Text> : null}
                {nutritionPlan.notes ? <Text style={styles.meta}>{nutritionPlan.notes}</Text> : null}
              </>
            ) : goals ? (
              <>
                <Text style={styles.cardTitle}>{t(`nutrition.${goals.goal}`)}</Text>
                <Text style={styles.body}>
                  {t('coaches.kcalProteinWater', {
                    kcal: formatNumber(goals.dailyCalories),
                    protein: formatNumber(goals.dailyProtein),
                    water: formatNumber(goals.dailyWater),
                  })}
                </Text>
                <Text style={styles.meta}>{sourceLabel}</Text>
              </>
            ) : (
              <Text style={styles.body}>{t('coaches.noNutritionGoals')}</Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.kicker}>{t('coaches.setNutritionPlan')}</Text>
            <Text style={styles.label}>{t('nutrition.planTitle')}</Text>
            <TextInput value={planTitle} onChangeText={setPlanTitle} placeholder={t('nutrition.planTitlePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>{t('nutrition.planDescription')}</Text>
            <TextInput value={planDescription} onChangeText={setPlanDescription} placeholder={t('nutrition.planDescriptionPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>{t('nutrition.kcal')}</Text>
            <TextInput value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('nutrition.proteinG')}</Text>
                <TextInput value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('nutrition.carbs')}</Text>
                <TextInput value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('nutrition.fat')}</Text>
                <TextInput value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholderTextColor={colors.muted} style={styles.input} />
              </View>
            </View>
            <Text style={styles.label}>{t('nutrition.waterMl')}</Text>
            <TextInput value={water} onChangeText={setWater} keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.chipRow}>
              {(['cut', 'maintain', 'bulk'] as const).map((item) => (
                <CoachChip key={item} label={t(`nutrition.${item}`)} active={goal === item} onPress={() => setGoal(item)} />
              ))}
            </View>
            <Text style={styles.label}>{t('nutrition.mealPlan')}</Text>
            <TextInput value={mealPlan} onChangeText={setMealPlan} placeholder={t('nutrition.mealPlanPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
            <Text style={styles.label}>{t('nutrition.planNotes')}</Text>
            <TextInput value={planNotes} onChangeText={setPlanNotes} placeholder={t('nutrition.planNotesPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
            <Pressable onPress={() => void saveNutrition()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
              {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('coaches.saveNutritionPlan')}</Text>}
            </Pressable>
          </View>
        </>
      ) : null}

      {tab === 'history' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.kicker}>{t('tabs.history')}</Text>
            {(detail?.recentWorkouts.length ?? 0) === 0 ? <Text style={styles.body}>{t('coaches.noWorkoutsYet')}</Text> : null}
            {detail?.recentWorkouts.map((session) => (
              <View key={session.id} style={styles.block}>
                <Text style={styles.slotName}>{session.dayLabel || t('today.title')}</Text>
                <Text style={styles.meta}>{shortDate(session.startedAt)} · {formatNumber(session.totalVolume)} {t('common.kg')}</Text>
                {session.exerciseNames.length ? <Text style={styles.meta}>{session.exerciseNames.join(' · ')}</Text> : null}
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.kicker}>{t('tabs.nutrition')}</Text>
            {(detail?.recentNutritionLogs.length ?? 0) === 0 ? <Text style={styles.body}>{t('coaches.noNutritionLogs')}</Text> : null}
            {detail?.recentNutritionLogs.map((log) => (
              <View key={log.date} style={styles.block}>
                <Text style={styles.slotName}>{log.date}</Text>
                <Text style={styles.meta}>
                  {t('coaches.kcalProteinWater', {
                    kcal: formatNumber(log.calories),
                    protein: formatNumber(log.protein),
                    water: formatNumber(log.waterMl),
                  })}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: 48 },
    eyebrow: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
    title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 6 },
    help: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
    kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
    body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 8 },
    meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
    block: { marginTop: spacing.sm },
    slotName: { color: colors.text, fontWeight: '800', fontSize: 16 },
    label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
    input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12, fontSize: 15, borderRadius: radius.sm },
    multiline: { minHeight: 92, paddingVertical: 12, textAlignVertical: 'top' },
    fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    field: { flexGrow: 1, flexBasis: 90, minWidth: 90 },
    primary: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: colors.ink, fontWeight: '900' },
    secondary: { marginTop: spacing.md, minHeight: 44, borderColor: colors.gold, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
    secondaryText: { color: colors.gold, fontWeight: '800' },
    error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
    message: { color: colors.success, fontSize: 13, marginTop: spacing.sm },
    disabled: { opacity: 0.65 },
  });
}
