import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { nutrition } from '../../services/api';
import { radius, spacing, useTheme, useThemedStyles, type ThemeColors } from '../../theme';
import { apiErrorMessage } from '../../../i18n';
import type { NutritionGoalKind } from '../../types/models';
import { CoachBackRow, CoachChip } from './coachUi';

function parseAmount(value: string) {
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function CoachNutritionPlanCreateScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState<NutritionGoalKind>('maintain');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [water, setWater] = useState('');
  const [mealPlan, setMealPlan] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function save() {
    const dailyCalories = parseAmount(calories);
    const dailyProtein = parseAmount(protein);
    const dailyCarbs = parseAmount(carbs);
    const dailyFat = parseAmount(fat);
    const dailyWater = parseAmount(water);
    if (!title.trim() || !Number.isFinite(dailyCalories) || !Number.isFinite(dailyProtein) || !Number.isFinite(dailyWater)) {
      setError(t('nutrition.planRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await nutrition.createPublicPlan({
        title: title.trim(),
        description: description.trim(),
        goal,
        dailyCalories,
        dailyProtein,
        dailyCarbs: Number.isFinite(dailyCarbs) ? dailyCarbs : 0,
        dailyFat: Number.isFinite(dailyFat) ? dailyFat : 0,
        dailyWater,
        mealPlan: mealPlan.trim(),
        notes: notes.trim(),
      });
      setInfo(t('coaches.publicNutritionPlanSaved'));
      setTitle('');
      setDescription('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setWater('');
      setMealPlan('');
      setNotes('');
    } catch (err) {
      setError(apiErrorMessage(err, t('coaches.publicNutritionPlanFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <CoachBackRow label={t('common.back')} onPress={() => navigation.goBack()} />
      <Text style={styles.eyebrow}>{t('coaches.publicNutritionPlanEyebrow')}</Text>
      <Text style={styles.title}>{t('coaches.publicNutritionPlan')}</Text>
      <Text style={styles.help}>{t('coaches.publicNutritionPlanHelp')}</Text>

      <Text style={styles.label}>{t('nutrition.planTitle')}</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder={t('nutrition.planTitlePlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('nutrition.planDescription')}</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder={t('nutrition.planDescriptionPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>{t('nutrition.goal')}</Text>
      <View style={styles.chipRow}>
        {(['cut', 'maintain', 'bulk'] as const).map((item) => (
          <CoachChip key={item} label={t(`nutrition.${item}`)} active={goal === item} onPress={() => setGoal(item)} />
        ))}
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.kcal')}</Text>
          <TextInput value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="2200" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.proteinG')}</Text>
          <TextInput value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="160" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.carbs')}</Text>
          <TextInput value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholder="240" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.fat')}</Text>
          <TextInput value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="70" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t('nutrition.waterMl')}</Text>
          <TextInput value={water} onChangeText={setWater} keyboardType="number-pad" placeholder="2500" placeholderTextColor={colors.muted} style={styles.input} />
        </View>
      </View>
      <Text style={styles.label}>{t('nutrition.mealPlan')}</Text>
      <TextInput value={mealPlan} onChangeText={setMealPlan} placeholder={t('nutrition.mealPlanPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />
      <Text style={styles.label}>{t('nutrition.planNotes')}</Text>
      <TextInput value={notes} onChangeText={setNotes} placeholder={t('nutrition.planNotesPlaceholder')} placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} multiline />

      <Pressable onPress={() => void save()} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.primaryText}>{t('coaches.publishNutritionPlan')}</Text>}
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
    multiline: { minHeight: 104, paddingVertical: 12, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    field: { flexGrow: 1, flexBasis: 100, minWidth: 90 },
    primary: { minHeight: 48, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md },
    primaryText: { color: colors.ink, fontWeight: '900' },
    message: { color: colors.success, marginTop: spacing.sm, fontSize: 13 },
    error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
    disabled: { opacity: 0.65 },
  });
}
