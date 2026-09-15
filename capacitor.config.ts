import type { CapacitorConfig } from '@capacitor/cli'
import type {} from '@capgo/capacitor-updater'

const updateCdn = process.env.UPDATE_CDN?.replace(/\/+$/, '')

const config: CapacitorConfig = {
  appId: 'com.nimiq.pay',
  appName: 'Nimiq Pay',
  webDir: 'dist',
  server: {
    errorPath: 'error.html',
  },
  loggingBehavior: 'debug',
  appendUserAgent: 'Nimiq Pay',
  plugins: {
    CapacitorUpdater: {
      // Native builds opt in only when the self-hosted endpoint is configured.
      autoUpdate: updateCdn ? 'atBackground' : 'off',
      updateUrl: updateCdn ? `${updateCdn}/api/updates` : '',
      statsUrl: '',
      channelUrl: '',
      defaultChannel: 'production',
      appReadyTimeout: 30000,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'nimiq-pay-sqlite',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Nimiq Pay',
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Nimiq Pay',
        biometricSubTitle: 'Log in using your biometric',
      },
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      // Local notifications default to the generic Android info icon; point them
      // at the Nimiq Pay icon (same drawable FCM push already uses). Android-only;
      // iOS local notifications always use the app icon.
      smallIcon: 'ic_stat_name',
    },
    PrivacyScreen: {
      enable: false,
      preventScreenshots: false,
    },
    Posthog: {
      apiKey: 'phc_Ar1vGHvWGTZDBG4m5VM9KkpOW6lFkV3fVqUocmoJ2DR',
      host: 'https://eu.i.posthog.com',
      enableSessionReplay: false,
      sessionReplayConfig: undefined,
      autoCaptureExceptions: true,
    },
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
}

export default config
