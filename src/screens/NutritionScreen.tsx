import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { nutrition } from '../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { ScreenSkeleton } from '../components/Skeleton';
import { apiErrorMessage, formatDate, formatNumber } from '../../i18n';
import type {
  ActivityLevel,
  NutritionGoalKind,
  NutritionGoals,
  NutritionMeal,
  NutritionSuggestion,
  Sex,
} from '../types/models';

function localDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function remainingLine(
  current: number,
  goal: number,
  unit: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const left = goal - current;
  if (left >= 0) return t('nutrition.remaining', { current: formatNumber(current), goal: formatNumber(goal), unit, left: formatNumber(left) });
  return t('nutrition.over', { current: formatNumber(current), goal: formatNumber(goal), unit, over: formatNumber(-left) });
}

function parseAmount(value: string) {
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

function useScreenTheme() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return { colors, styles };
}

function ProgressRing({ current, goal, label }: { current: number; goal: number; label: string }) {
  const { colors, styles } = useScreenTheme();
  const size = 92;
  const stroke = 8;
  const center = size / 2;
  const radiusPx = (size - stroke) / 2;
  const circ = 2 * Math.PI * radiusPx;
  const progress = goal > 0 ? Math.min(current / goal, 1) : 0;
  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radiusPx} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radiusPx}
          stroke={progress >= 1 ? colors.success : colors.gold}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringValue}>{formatNumber(current)}</Text>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useScreenTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

type OnboardingProps = {
  onSaved: () => void;
  onCancel?: () => void;
  currentGoals?: NutritionGoals | null;
};

function OnboardingCard({ onSaved, onCancel, currentGoals }: OnboardingProps) {
  const { t } = useTranslation();
  const { colors, styles } = useScreenTheme();
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<NutritionGoalKind>(currentGoals?.goal ?? 'maintain');
  const [suggestion, setSuggestion] = useState<NutritionSuggestion | null>(null);
  const [draftCalories, setDraftCalories] = useState(currentGoals ? String(currentGoals.dailyCalories) : '');
  const [draftProtein, setDraftProtein] = useState(currentGoals ? String(currentGoals.dailyProtein) : '');
  const [draftWater, setDraftWater] = useState(currentGoals ? String(currentGoals.dailyWater) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activityOptions: { id: ActivityLevel; key: string }[] = [
    { id: 'sedentary', key: 'nutrition.sedentary' },
    { id: 'light', key: 'nutrition.light' },
    { id: 'moderate', key: 'nutrition.moderate' },
    { id: 'active', key: 'nutrition.active' },
    { id: 'very_active', key: 'nutrition.veryActive' },
  ];
  const goalOptions: { id: NutritionGoalKind; key: string }[] = [
    { id: 'cut', key: 'nutrition.cut' },
    { id: 'maintain', key: 'nutrition.maintain' },
    { id: 'bulk', key: 'nutrition.bulk' },
  ];

  async function calculate() {
    setError('');
    const ageN = parseAmount(age);
    const weightN = parseAmount(weightKg);
    const heightN = parseAmount(heightCm);
    if (!Number.isFinite(ageN) || !Number.isFinite(weightN) || !Number.isFinite(heightN)) {
      setError(t('nutrition.needStats'));
      return;
    }
    setLoading(true);
    try {
      const result = await nutrition.calculate({ age: ageN, sex, weightKg: weightN, heightCm: heightN, activityLevel, goal });
      setSuggestion(result);
      setDraftCalories(String(result.dailyCalories));
      setDraftProtein(String(result.dailyProtein));
      setDraftWater(String(result.dailyWater));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.calculateFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setError('');
    const dailyCalories = parseAmount(draftCalories);
    const dailyProtein = parseAmount(draftProtein);
    const dailyWater = parseAmount(draftWater);
    if (!Number.isFinite(dailyCalories) || !Number.isFinite(dailyProtein) || !Number.isFinite(dailyWater)) {
      setError(t('nutrition.needTargets'));
      return;
    }
    setLoading(true);
    try {
      await nutrition.saveGoals({ dailyCalories, dailyProtein, dailyWater, goal });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.saveFailed')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.kicker}>{t('nutrition.kicker')}</Text>
        <Text style={styles.cardTitle}>{t('nutrition.onboardingTitle')}</Text>
        <Text style={styles.cardSubtitle}>{t('nutrition.onboardingSubtitle')}</Text>
      </View>
      <Text style={styles.label}>{t('nutrition.sex')}</Text>
      <View style={styles.switcher}>
        <Chip label={t('nutrition.male')} active={sex === 'male'} onPress={() => setSex('male')} />
        <Chip label={t('nutrition.female')} active={sex === 'female'} onPress={() => setSex('female')} />
      </View>
      <Text style={styles.label}>{t('nutrition.goal')}</Text>
      <View style={styles.chipRow}>
        {goalOptions.map((option) => (
          <Chip key={option.id} label={t(option.key)} active={goal === option.id} onPress={() => setGoal(option.id)} />
        ))}
      </View>
      <Text style={styles.label}>{t('nutrition.activity')}</Text>
      <View style={styles.chipRow}>
        {activityOptions.map((option) => (
          <Chip key={option.id} label={t(option.key)} active={activityLevel === option.id} onPress={() => setActivityLevel(option.id)} />
        ))}
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.age')}</Text>
          <TextInput value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="28" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.weightKg')}</Text>
          <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholder="78" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.heightCm')}</Text>
          <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" placeholder="178" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
      </View>
      <Pressable onPress={calculate} disabled={loading} style={[styles.secondaryButton, loading && styles.disabled]}>
        <Text style={styles.secondaryButtonText}>{t('nutrition.calculate')}</Text>
      </Pressable>
      {suggestion || currentGoals ? (
        <View style={styles.suggestion}>
          <Text style={styles.kicker}>{suggestion ? t('nutrition.suggestedTargets') : t('nutrition.currentTargets')}</Text>
          {suggestion ? <Text style={styles.suggestionMeta}>{t('nutrition.bmrTdee', { bmr: formatNumber(suggestion.bmr), tdee: formatNumber(suggestion.tdee) })}</Text> : null}
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('nutrition.kcal')}</Text>
              <TextInput value={draftCalories} onChangeText={setDraftCalories} keyboardType="number-pad" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('nutrition.proteinG')}</Text>
              <TextInput value={draftProtein} onChangeText={setDraftProtein} keyboardType="decimal-pad" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('nutrition.waterMl')}</Text>
              <TextInput value={draftWater} onChangeText={setDraftWater} keyboardType="number-pad" style={styles.input} />
            </View>
          </View>
          <Pressable onPress={save} disabled={loading} style={[styles.primaryButton, loading && styles.disabled]}>
            <Text style={styles.primaryButtonText} numberOfLines={2}>{suggestion ? t('nutrition.useThis') : t('nutrition.saveGoals')}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {onCancel ? (
        <Pressable onPress={onCancel} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{t('common.cancel')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NutritionScreen() {
  const { t } = useTranslation();
  const { colors, styles } = useScreenTheme();
  const date = localDateString();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const [meals, setMeals] = useState<NutritionMeal[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [mealOpen, setMealOpen] = useState(false);
  const [mealName, setMealName] = useState('');
  const [mealCalories, setMealCalories] = useState('');
  const [mealProtein, setMealProtein] = useState('');
  const [mealCarbs, setMealCarbs] = useState('');
  const [mealFat, setMealFat] = useState('');
  const [customWater, setCustomWater] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const log = await nutrition.getLog(date);
      setGoals(log.goals);
      setNeedsOnboarding(log.needsOnboarding);
      setMeals(log.meals);
      setWaterMl(log.waterMl);
      if (!log.needsOnboarding) setEditingGoals(false);
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const calories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const protein = meals.reduce((sum, meal) => sum + meal.protein, 0);

  async function addWater(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const updated = await nutrition.addWater(date, amount);
      setWaterMl(updated.waterMl);
      setMeals(updated.meals);
      setCustomWater('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.waterFailed')));
    } finally {
      setSaving(false);
    }
  }

  async function addMeal() {
    const name = mealName.trim();
    const cals = parseAmount(mealCalories);
    if (!name || !Number.isFinite(cals) || cals < 0) {
      setError(t('nutrition.needMeal'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await nutrition.addMeal(date, {
        name,
        calories: cals,
        protein: Number.isFinite(parseAmount(mealProtein)) ? parseAmount(mealProtein) : 0,
        carbs: Number.isFinite(parseAmount(mealCarbs)) ? parseAmount(mealCarbs) : 0,
        fat: Number.isFinite(parseAmount(mealFat)) ? parseAmount(mealFat) : 0,
      });
      setMeals(updated.meals);
      setWaterMl(updated.waterMl);
      setMealName('');
      setMealCalories('');
      setMealProtein('');
      setMealCarbs('');
      setMealFat('');
      setMealOpen(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.mealFailed')));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(meal: NutritionMeal) {
    Alert.alert(t('nutrition.removeMealTitle'), t('nutrition.removeMealBody', { name: meal.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => { void deleteMeal(meal._id); },
      },
    ]);
  }

  async function deleteMeal(mealId: string) {
    setSaving(true);
    try {
      const updated = await nutrition.deleteMeal(date, mealId);
      setMeals(updated.meals);
      setWaterMl(updated.waterMl);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      setError(apiErrorMessage(err, t('nutrition.deleteFailed')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenSkeleton variant="rings" />;

  const showOnboarding = needsOnboarding || editingGoals;
  const displayDate = (() => {
    const [y, m, day] = date.split('-').map(Number);
    return formatDate(new Date(y, m - 1, day), { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  })();
  const goalLabel = goals ? t(`nutrition.${goals.goal}`) : '';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flex: 1, paddingEnd: spacing.sm }}>
            <Text style={styles.eyebrow}>{displayDate}</Text>
            <Text style={styles.title}>{t('nutrition.title')}</Text>
          </View>
          {goals && !showOnboarding ? (
            <Pressable onPress={() => setEditingGoals(true)} style={styles.headerAction}>
              <Ionicons name="options-outline" size={18} color={colors.gold} />
              <Text style={styles.headerActionText}>{t('nutrition.goals')}</Text>
            </Pressable>
          ) : null}
        </View>

        {showOnboarding ? (
          <OnboardingCard
            currentGoals={goals}
            onSaved={() => { void load(); }}
            onCancel={goals ? () => setEditingGoals(false) : undefined}
          />
        ) : goals ? (
          <>
            <View style={styles.rings}>
              <ProgressRing current={calories} goal={goals.dailyCalories} label={t('nutrition.kcal')} />
              <ProgressRing current={protein} goal={goals.dailyProtein} label={t('nutrition.protein')} />
              <ProgressRing current={waterMl} goal={goals.dailyWater} label={t('nutrition.water')} />
            </View>
            <Text style={[styles.remain, calories > goals.dailyCalories && { color: colors.error }]}>{remainingLine(calories, goals.dailyCalories, t('nutrition.unitKcal'), t)}</Text>
            <Text style={[styles.remain, protein > goals.dailyProtein && { color: colors.error }]}>{remainingLine(protein, goals.dailyProtein, t('nutrition.unitProtein'), t)}</Text>
            <Text style={[styles.remain, waterMl > goals.dailyWater && { color: colors.error }]}>{remainingLine(waterMl, goals.dailyWater, t('nutrition.unitMl'), t)}</Text>
            <Text style={styles.goalHint}>
              {goalLabel} · {goals.source === 'coach'
                ? t('nutrition.coachTargets', { name: goals.setByCoachName || t('coaches.coachFallback') })
                : goals.source === 'manual'
                  ? t('nutrition.manualTargets')
                  : t('nutrition.calculatedTargets')}
            </Text>

            <View style={styles.card}>
              <Text style={styles.kicker}>{t('nutrition.hydration')}</Text>
              <Text style={styles.cardTitle}>{t('nutrition.quickAddWater')}</Text>
              <View style={styles.waterRow}>
                <Pressable onPress={() => void addWater(250)} disabled={saving} style={styles.waterButton}>
                  <Text style={styles.waterButtonText}>{t('nutrition.add250')}</Text>
                </Pressable>
                <Pressable onPress={() => void addWater(500)} disabled={saving} style={styles.waterButton}>
                  <Text style={styles.waterButtonText}>{t('nutrition.add500')}</Text>
                </Pressable>
              </View>
              <View style={styles.customWater}>
                <TextInput
                  value={customWater}
                  onChangeText={setCustomWater}
                  keyboardType="number-pad"
                  placeholder={t('nutrition.customMl')}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.customWaterInput]}
                />
                <Pressable onPress={() => void addWater(parseAmount(customWater))} disabled={saving} style={styles.smallPrimary}>
                  <Text style={styles.primaryButtonText}>{t('common.add')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Pressable onPress={() => setMealOpen((open) => !open)} style={styles.mealToggle}>
                <View>
                  <Text style={styles.kicker}>{t('nutrition.meals')}</Text>
                  <Text style={styles.cardTitle}>{t('nutrition.logMeal')}</Text>
                </View>
                <Ionicons name={mealOpen ? 'chevron-up' : 'add'} size={22} color={colors.gold} />
              </Pressable>
              {mealOpen ? (
                <View style={styles.mealForm}>
                  <Text style={styles.label}>{t('nutrition.name')}</Text>
                  <TextInput value={mealName} onChangeText={setMealName} placeholder={t('nutrition.mealPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.label}>{t('nutrition.kcal')}</Text>
                      <TextInput value={mealCalories} onChangeText={setMealCalories} keyboardType="decimal-pad" placeholder="540" placeholderTextColor={colors.muted} style={styles.input} />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>{t('nutrition.protein')}</Text>
                      <TextInput value={mealProtein} onChangeText={setMealProtein} keyboardType="decimal-pad" placeholder="45" placeholderTextColor={colors.muted} style={styles.input} />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.label}>{t('nutrition.carbs')}</Text>
                      <TextInput value={mealCarbs} onChangeText={setMealCarbs} keyboardType="decimal-pad" placeholder="50" placeholderTextColor={colors.muted} style={styles.input} />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>{t('nutrition.fat')}</Text>
                      <TextInput value={mealFat} onChangeText={setMealFat} keyboardType="decimal-pad" placeholder="12" placeholderTextColor={colors.muted} style={styles.input} />
                    </View>
                  </View>
                  <Pressable onPress={() => void addMeal()} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
                    <Text style={styles.primaryButtonText} numberOfLines={2}>{t('nutrition.addMeal')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Text style={styles.listLabel}>{t('nutrition.todaysLog')}</Text>
            {meals.length === 0 ? (
              <EmptyState title={t('nutrition.emptyMealsTitle')} hint={t('nutrition.emptyMealsHint')} />
            ) : (
              meals.map((meal) => (
                <Pressable key={meal._id} onPress={() => confirmDelete(meal)} style={styles.mealRow}>
                  <View style={styles.mealRowText}>
                    <Text style={styles.mealName}>{meal.name}</Text>
                    <Text style={styles.mealMeta}>{t('nutrition.mealMeta', { kcal: formatNumber(meal.calories), protein: formatNumber(meal.protein), carbs: formatNumber(meal.carbs), fat: formatNumber(meal.fat) })}</Text>
                  </View>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg, paddingTop: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  headerActionText: { color: colors.gold, fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  ringWrap: { alignItems: 'center', width: 104 },
  ringCenter: { position: 'absolute', top: 0, start: 0, end: 0, height: 92, alignItems: 'center', justifyContent: 'center' },
  ringValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  ringLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  remain: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 4 },
  goalHint: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  cardHeader: { borderStartColor: colors.gold, borderStartWidth: 3, paddingStart: spacing.sm, marginBottom: spacing.md },
  kicker: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
  cardSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: spacing.sm },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12, fontSize: 15, borderRadius: radius.sm },
  switcher: { flexDirection: 'row', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: colors.ink },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexGrow: 1, flexBasis: 90, minWidth: 90 },
  primaryButton: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.sm, paddingHorizontal: 12 },
  primaryButtonText: { color: colors.ink, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.sm },
  secondaryButtonText: { color: colors.gold, fontWeight: '900', letterSpacing: 0.6 },
  smallPrimary: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 16, justifyContent: 'center', minHeight: 46 },
  disabled: { opacity: 0.65 },
  suggestion: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  suggestionMeta: { color: colors.muted, fontSize: 12, marginTop: 6 },
  textButton: { alignItems: 'center', marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { color: colors.muted, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, textAlign: 'center' },
  waterRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  waterButton: { flex: 1, minHeight: 46, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  waterButtonText: { color: colors.gold, fontWeight: '800' },
  customWater: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  customWaterInput: { flex: 1 },
  mealToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  mealForm: { marginTop: spacing.sm },
  listLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  mealRow: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  mealRowText: { flex: 1 },
  mealName: { color: colors.text, fontSize: 16, fontWeight: '800' },
    mealMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  });
}
