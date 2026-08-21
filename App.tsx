import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { TodayScreen } from './src/screens/TodayScreen';
import { NutritionScreen } from './src/screens/NutritionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { SettingsScreen } from './src/screens/OtherScreens';
import { colors } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreenView';
import { auth } from './src/services/api';
import i18n, { initI18n } from './i18n';
import type { RootTabs } from './src/navigation';

const Tabs = createBottomTabNavigator<RootTabs>();
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.text,
    primary: colors.accent,
  },
};

const TAB_ICONS = {
  Today: 'barbell-outline',
  Nutrition: 'nutrition-outline',
  History: 'time-outline',
  Progress: 'stats-chart-outline',
  Settings: 'settings-outline',
} as const;

function AppTabs() {
  const { t } = useTranslation();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="Today" component={TodayScreen} options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="Nutrition" component={NutritionScreen} options={{ title: t('tabs.nutrition') }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: t('tabs.history') }} />
      <Tabs.Screen name="Progress" component={ProgressScreen} options={{ title: t('tabs.progress') }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: t('tabs.settings') }} />
    </Tabs.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    Promise.all([initI18n(), auth.restoreSession()])
      .then(([, ok]) => {
        setAuthenticated(ok);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="light" />
      {authenticated ? (
        <NavigationContainer theme={navTheme}>
          <AppTabs />
        </NavigationContainer>
      ) : (
        <LoginScreen onAuthenticated={() => setAuthenticated(true)} />
      )}
    </I18nextProvider>
  );
}
