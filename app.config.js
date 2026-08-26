function reversedGoogleScheme(clientId) {
  if (typeof clientId !== 'string' || !clientId.endsWith('.apps.googleusercontent.com')) return null;
  return clientId.split('.').reverse().join('.');
}

const LOCATION_WHEN_IN_USE =
  'Iron Log uses your location to draw your run or ride route while the app is open.';

/** Adds the reversed Google iOS/Android client ID URL schemes required for OAuth redirects. */
module.exports = ({ config }) => {
  const schemes = new Set(
    (Array.isArray(config.scheme) ? config.scheme : [config.scheme]).filter(Boolean)
  );
  schemes.add('ironlog');
  schemes.add('com.zineeddine.ironlog');
  const ios = reversedGoogleScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const android = reversedGoogleScheme(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
  if (ios) schemes.add(ios);
  if (android) schemes.add(android);

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  const mapsKeyAndroid = process.env.GOOGLE_MAPS_API_KEY_ANDROID || mapsKey;
  const mapsKeyIos = process.env.GOOGLE_MAPS_API_KEY_IOS || mapsKey;

  return {
    ...config,
    scheme: [...schemes],
    plugins: [
      ...(config.plugins || []),
      [
        'expo-location',
        {
          locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#C9A227',
          defaultChannel: 'coaching',
        },
      ],
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.zineeddine.ironlog',
      config: {
        ...(config.ios && config.ios.config),
        googleMapsApiKey: mapsKeyIos,
      },
      infoPlist: {
        ...(config.ios && config.ios.infoPlist),
        NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      },
    },
    android: {
      ...config.android,
      package: 'com.zineeddine.ironlog',
      // Optional: point at google-services.json if you place it locally.
      // Prefer uploading FCM V1 via `eas credentials -p android` for EAS builds.
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
      config: {
        ...(config.android && config.android.config),
        googleMaps: {
          apiKey: mapsKeyAndroid,
        },
      },
    },
  };
};
