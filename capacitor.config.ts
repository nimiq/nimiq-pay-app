import type { CapacitorConfig } from '@capacitor/cli'

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
