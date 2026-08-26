import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, useWindowDimensions, View } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { TodayScreen } from './src/screens/TodayScreen';
import { RunTrackingScreen } from './src/screens/RunTrackingScreen';
import { NutritionScreen } from './src/screens/NutritionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { CardioRouteScreen } from './src/screens/CardioRouteScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { SettingsScreen } from './src/screens/OtherScreens';
import { CoachDirectoryScreen } from './src/screens/coaches/CoachDirectoryScreen';
import { CoachProfileScreen } from './src/screens/coaches/CoachProfileScreen';
import { BecomeCoachScreen } from './src/screens/coaches/BecomeCoachScreen';
import { CoachInboxScreen } from './src/screens/coaches/CoachInboxScreen';
import { CoachClientsScreen } from './src/screens/coaches/CoachClientsScreen';
import { CoachClientDetailScreen } from './src/screens/coaches/CoachClientDetailScreen';
import { CoachVideoUploadScreen } from './src/screens/coaches/CoachVideoUploadScreen';
import { CoachNutritionPlanCreateScreen } from './src/screens/coaches/CoachNutritionPlanCreateScreen';
import { CoachVideoPlayerScreen } from './src/screens/coaches/CoachVideoPlayerScreen';
import { AssignCoachProgramScreen } from './src/screens/coaches/AssignCoachProgramScreen';
import { CoachHomeScreen } from './src/screens/coaches/CoachHomeScreen';
import { ThemeProvider, useTheme } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreenView';
import { auth, users } from './src/services/api';
import {
  cancelAllLocalNotifications,
  getNotificationPermission,
  syncNotificationsForUser,
  unregisterPushTokenFromServer,
} from './src/notifications';
import { markFiredToday } from './src/notifications/oncePerDay';
import i18n, { initI18n } from './i18n';
import type { CoachesStackParamList, HistoryStackParamList, RootTabs, TodayStackParamList } from './src/navigation';
import type { UserRole } from './src/types/models';

const Tabs = createBottomTabNavigator<RootTabs>();
const CoachStack = createNativeStackNavigator<CoachesStackParamList>();
const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

const TAB_ICONS = {
  Today: 'home-outline',
  Nutrition: 'nutrition-outline',
  History: 'calendar-outline',
  Progress: 'stats-chart-outline',
  Coaches: 'people-outline',
  Settings: 'settings-outline',
} as const;

function CoachesNavigator({ isCoach }: { isCoach: boolean }) {
  return (
    <CoachStack.Navigator
      initialRouteName={isCoach ? 'CoachHome' : 'CoachDirectory'}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <CoachStack.Screen name="CoachHome" component={CoachHomeScreen} />
      <CoachStack.Screen name="CoachDirectory" component={CoachDirectoryScreen} />
      <CoachStack.Screen name="CoachProfile" component={CoachProfileScreen} />
      <CoachStack.Screen name="BecomeCoach" component={BecomeCoachScreen} />
      <CoachStack.Screen name="CoachInbox" component={CoachInboxScreen} />
      <CoachStack.Screen name="CoachClients" component={CoachClientsScreen} />
      <CoachStack.Screen name="CoachClientDetail" component={CoachClientDetailScreen} />
      <CoachStack.Screen name="CoachVideoUpload" component={CoachVideoUploadScreen} />
      <CoachStack.Screen name="CoachNutritionPlanCreate" component={CoachNutritionPlanCreateScreen} />
      <CoachStack.Screen name="CoachVideoPlayer" component={CoachVideoPlayerScreen} />
      <CoachStack.Screen name="AssignCoachProgram" component={AssignCoachProgramScreen} />
    </CoachStack.Navigator>
  );
}

function TodayNavigator() {
  return (
    <TodayStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} />
      <TodayStack.Screen name="RunTracking" component={RunTrackingScreen} />
    </TodayStack.Navigator>
  );
}

function HistoryNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <HistoryStack.Screen name="HistoryHome" component={HistoryScreen} />
      <HistoryStack.Screen name="CardioRoute" component={CardioRouteScreen} />
    </HistoryStack.Navigator>
  );
}

function AppTabs({ onLogout, role }: { onLogout: () => void; role: UserRole }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCoach = role === 'coach';
  const sidebar = width >= 768;
  return (
    <Tabs.Navigator
      initialRouteName={isCoach ? 'Coaches' : 'Today'}
      screenOptions={({ route }) => {
        const nested = getFocusedRouteNameFromRoute(route);
        const hideTab = nested === 'RunTracking' || nested === 'CardioRoute';
        return {
        headerShown: false,
        animation: 'fade',
        tabBarPosition: sidebar ? 'left' : 'bottom',
        tabBarVariant: sidebar ? 'material' : 'uikit',
        tabBarLabelPosition: sidebar ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.accentMuted,
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarStyle: hideTab
          ? { display: 'none' }
          : sidebar
          ? {
              backgroundColor: colors.surface,
              borderRightColor: colors.border,
              borderRightWidth: 1,
              borderTopWidth: 0,
              width: 196,
              paddingTop: 18 + insets.top,
              paddingBottom: 18 + insets.bottom,
            }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              height: 74 + insets.bottom,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 12),
            },
        tabBarItemStyle: sidebar
          ? { minHeight: 52, marginHorizontal: 10, marginVertical: 3, borderRadius: 8, paddingHorizontal: 10 }
          : { minHeight: 54, paddingVertical: 4 },
        tabBarLabelStyle: sidebar
          ? { fontSize: 13, fontWeight: '800', marginStart: 8 }
          : { fontSize: 10, fontWeight: '800', marginTop: 2 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={sidebar ? 22 : size} color={color} />
        ),
      };
      }}
    >
      <Tabs.Screen name="Today" component={TodayNavigator} options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="Nutrition" component={NutritionScreen} options={{ title: t('tabs.nutrition') }} />
      <Tabs.Screen name="History" component={HistoryNavigator} options={{ title: t('tabs.history') }} />
      <Tabs.Screen name="Progress" component={ProgressScreen} options={{ title: t('tabs.progress') }} />
      <Tabs.Screen
        name="Coaches"
        options={{ title: isCoach ? t('tabs.coachSpace') : t('tabs.coaches') }}
      >
        {() => <CoachesNavigator isCoach={isCoach} />}
      </Tabs.Screen>
      <Tabs.Screen name="Settings" options={{ title: t('tabs.settings') }}>
        {() => <SettingsScreen onLogout={onLogout} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

async function refreshNotificationsQuietly() {
  try {
    const permission = await getNotificationPermission();
    if (permission !== 'granted') return;
    const profile = await users.getMe();
    await syncNotificationsForUser(profile);
  } catch {
    // ignore background sync failures
  }
}

function AppShell({
  authenticated,
  role,
  onAuthenticated,
  onLogout,
}: {
  authenticated: boolean;
  role: UserRole;
  onAuthenticated: (role: UserRole) => void;
  onLogout: () => void;
}) {
  const { colors, resolved } = useTheme();
  const appState = useRef(AppState.currentState);
  const navTheme = useMemo(() => ({
    ...(resolved === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolved === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      border: colors.border,
      text: colors.text,
      primary: colors.accent,
    },
  }), [colors, resolved]);

  useEffect(() => {
    if (!authenticated) return;
    void refreshNotificationsQuietly();
  }, [authenticated, role]);

  useEffect(() => {
    if (!authenticated) return;
    const onChange = (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        void refreshNotificationsQuietly();
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [authenticated]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;
      if (type === 'streak_at_risk') {
        void markFiredToday('streak');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <ThemedStatusBar />
      {authenticated ? (
        <NavigationContainer theme={navTheme}>
          <AppTabs onLogout={onLogout} role={role} />
        </NavigationContainer>
      ) : (
        <LoginScreen onAuthenticated={onAuthenticated} />
      )}
    </>
  );
}

function AppBootstrap() {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<UserRole>('athlete');

  useEffect(() => {
    Promise.all([initI18n(), auth.restoreSession()])
      .then(([, session]) => {
        setRole(session.role);
        setAuthenticated(session.ok);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedStatusBar />
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <AppShell
        authenticated={authenticated}
        role={role}
        onAuthenticated={(nextRole) => {
          setRole(nextRole);
          setAuthenticated(true);
        }}
        onLogout={() => {
          void (async () => {
            await unregisterPushTokenFromServer().catch(() => undefined);
            await cancelAllLocalNotifications().catch(() => undefined);
            await auth.logout();
            setRole('athlete');
            setAuthenticated(false);
          })();
        }}
      />
    </I18nextProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppBootstrap />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
