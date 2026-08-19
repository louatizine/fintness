import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { TodayScreen } from './src/screens/TodayScreen';
import { HistoryScreen, ProgressScreen, SettingsScreen } from './src/screens/OtherScreens';
import { colors } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreenView';
import { authApi } from './src/services/authApi';

const Tabs = createBottomTabNavigator();
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, border: colors.border, text: colors.text, primary: colors.accent } };

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => { authApi.restoreSession().then((token) => { setAuthenticated(Boolean(token)); setSessionReady(true); }).catch(() => setSessionReady(true)); }, []);
  if (!sessionReady) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View>;
  if (!authenticated) return <><StatusBar style="light" /><LoginScreen onAuthenticated={() => setAuthenticated(true)} /></>;
  return <NavigationContainer theme={navTheme}><StatusBar style="light" /><Tabs.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8 }, tabBarIcon: ({ color, size }) => { const icons = { Today: 'barbell-outline', History: 'time-outline', Progress: 'stats-chart-outline', Settings: 'settings-outline' } as const; return <Ionicons name={icons[route.name as keyof typeof icons]} size={size} color={color} />; } })}><Tabs.Screen name="Today" component={TodayScreen} /><Tabs.Screen name="History" component={HistoryScreen} /><Tabs.Screen name="Progress" component={ProgressScreen} /><Tabs.Screen name="Settings" component={SettingsScreen} /></Tabs.Navigator></NavigationContainer>;
}
