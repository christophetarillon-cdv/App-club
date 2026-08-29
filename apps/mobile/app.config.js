// app.config.js remplace app.json pour pouvoir faire varier le bundle
// identifier/nom selon APP_VARIANT — permet d'installer la version "test"
// (clubvoiron-dev) à côté de la vraie app (App Store) sur le même iPhone,
// ce qu'un bundle identifier partagé interdirait.
const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    name: IS_DEV_VARIANT ? 'CDCV Dev' : 'CDCV',
    slug: 'cdcv',
    version: '1.0.1',
    scheme: IS_DEV_VARIANT ? 'cdcv-dev' : 'cdcv',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: IS_DEV_VARIANT
        ? 'fr.clubdansecoublevievoiron.app.dev'
        : 'fr.clubdansecoublevievoiron.app',
      supportsTablet: true,
      googleServicesFile: './GoogleService-Info.plist',
      infoPlist: {
        NSCameraUsageDescription: 'CDCV accède à la caméra pour prendre ta photo de profil et scanner les QR codes du kiosque de pointage.',
        NSFaceIDUsageDescription: 'Autoriser CDCV à utiliser Face ID pour vous connecter rapidement.',
        UIBackgroundModes: ['audio'],
      },
    },
    android: {
      package: 'fr.clubdansecoublevievoiron.app',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.CAMERA',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FFFFFF',
          image: './assets/splash-icon.png',
          imageWidth: 200,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'CDCV accède à ta galerie pour envoyer des photos et vidéos dans le chat.',
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'CDCV accède à ta galerie pour enregistrer les fichiers téléchargés.',
          savePhotosPermission: 'CDCV enregistre des fichiers dans ta galerie.',
          isAccessMediaLocationEnabled: false,
        },
      ],
      '@react-native-community/datetimepicker',
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#2F86C0',
        },
      ],
      'expo-secure-store',
      'expo-local-authentication',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '5460d3d9-fefc-4136-8d96-26b3e89fc416',
      },
    },
    owner: 'christophetarillon',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/5460d3d9-fefc-4136-8d96-26b3e89fc416',
    },
  },
};
