import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { TodayScreen } from './src/screens/TodayScreen';
import { NutritionScreen } from './src/screens/NutritionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { SettingsScreen } from './src/screens/OtherScreens';
import { CoachDirectoryScreen } from './src/screens/coaches/CoachDirectoryScreen';
import { CoachProfileScreen } from './src/screens/coaches/CoachProfileScreen';
import { BecomeCoachScreen } from './src/screens/coaches/BecomeCoachScreen';
import { CoachInboxScreen } from './src/screens/coaches/CoachInboxScreen';
import { CoachClientsScreen } from './src/screens/coaches/CoachClientsScreen';
import { CoachClientDetailScreen } from './src/screens/coaches/CoachClientDetailScreen';
import { CoachVideoUploadScreen } from './src/screens/coaches/CoachVideoUploadScreen';
import { CoachVideoPlayerScreen } from './src/screens/coaches/CoachVideoPlayerScreen';
import { AssignCoachProgramScreen } from './src/screens/coaches/AssignCoachProgramScreen';
import { CoachHomeScreen } from './src/screens/coaches/CoachHomeScreen';
import { ThemeProvider, useTheme } from './src/theme';
import { LoginScreen } from './src/screens/LoginScreenView';
import { auth } from './src/services/api';
import i18n, { initI18n } from './i18n';
import type { CoachesStackParamList, RootTabs } from './src/navigation';
import type { UserRole } from './src/types/models';

const Tabs = createBottomTabNavigator<RootTabs>();
const CoachStack = createNativeStackNavigator<CoachesStackParamList>();

const TAB_ICONS = {
  Today: 'barbell-outline',
  Nutrition: 'nutrition-outline',
  History: 'time-outline',
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
      <CoachStack.Screen name="CoachVideoPlayer" component={CoachVideoPlayerScreen} />
      <CoachStack.Screen name="AssignCoachProgram" component={AssignCoachProgramScreen} />
    </CoachStack.Navigator>
  );
}

function AppTabs({ onLogout, role }: { onLogout: () => void; role: UserRole }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isCoach = role === 'coach';
  return (
    <Tabs.Navigator
      initialRouteName={isCoach ? 'Coaches' : 'Today'}
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
          void auth.logout().then(() => {
            setRole('athlete');
            setAuthenticated(false);
          });
        }}
      />
    </I18nextProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppBootstrap />
    </ThemeProvider>
  );
}
