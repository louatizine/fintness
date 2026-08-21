import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NATIVE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

const LANGUAGE_KEY = 'ironlog.language';

export function isRtlLanguage(lang: string) {
  return lang === 'ar';
}

export function detectDeviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode?.split('-')[0] ?? 'en';
  if (code === 'fr' || code === 'ar' || code === 'en') return code;
  return 'en';
}

function applyWebDir(rtl: boolean) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }
}

export async function applyRtlIfNeeded(lang: AppLanguage): Promise<boolean> {
  const shouldRtl = isRtlLanguage(lang);
  if (Platform.OS === 'web') {
    applyWebDir(shouldRtl);
    return false;
  }
  if (I18nManager.isRTL === shouldRtl) return false;
  I18nManager.allowRTL(shouldRtl);
  I18nManager.forceRTL(shouldRtl);
  try {
    await reloadAppAsync('language change');
  } catch {
    return false;
  }
  return true;
}

export async function initI18n() {
  const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
  const lang: AppLanguage =
    saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)
      ? (saved as AppLanguage)
      : detectDeviceLanguage();

  if (!saved) {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
        ar: { translation: ar },
      },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });
  } else {
    await i18n.changeLanguage(lang);
  }

  await applyRtlIfNeeded(lang);
  return i18n;
}

export async function changeAppLanguage(lang: AppLanguage) {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  await applyRtlIfNeeded(lang);
}

export function currentLanguage(): AppLanguage {
  const lng = (i18n.language ?? 'en').split('-')[0];
  if (lng === 'fr' || lng === 'ar') return lng;
  return 'en';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('en-US', { numberingSystem: 'latn', ...options }).format(value);
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  const locale = currentLanguage();
  return new Intl.DateTimeFormat(locale, { numberingSystem: 'latn', ...options }).format(date);
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default i18n;
