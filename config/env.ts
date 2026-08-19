type EnvConfig = {
  atlasAppId: string;
  atlasDataApiUrl: string;
  atlasDataApiKey: string;
  atlasDataSource: string;
  atlasDbName: string;
};

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Configuration Expo manquante: ${name}. Ajoutez-la dans .env puis redemarrez Metro.`);
  }
  return value.trim();
}

const atlasDataApiUrl = required('EXPO_PUBLIC_ATLAS_DATA_API_URL', process.env.EXPO_PUBLIC_ATLAS_DATA_API_URL);
if (!atlasDataApiUrl.startsWith('https://')) {
  throw new Error('Configuration invalide: EXPO_PUBLIC_ATLAS_DATA_API_URL doit commencer par https://.');
}

export const env: EnvConfig = {
  atlasAppId: required('EXPO_PUBLIC_ATLAS_APP_ID', process.env.EXPO_PUBLIC_ATLAS_APP_ID),
  atlasDataApiUrl,
  atlasDataApiKey: required('EXPO_PUBLIC_ATLAS_DATA_API_KEY', process.env.EXPO_PUBLIC_ATLAS_DATA_API_KEY),
  atlasDataSource: required('EXPO_PUBLIC_ATLAS_DATA_SOURCE', process.env.EXPO_PUBLIC_ATLAS_DATA_SOURCE),
  atlasDbName: required('EXPO_PUBLIC_ATLAS_DB_NAME', process.env.EXPO_PUBLIC_ATLAS_DB_NAME),
};