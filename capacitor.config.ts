import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nimiq.pay',
  appName: 'Nimiq Pay',
  webDir: 'dist',
  server: {
    errorPath: 'error.html'
  },
  loggingBehavior: 'debug',
  appendUserAgent: 'Nimiq Pay',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: 'atBackground',
      updateUrl: 'https://updates.nimpay.app/api/updates',
      statsUrl: '',
      channelUrl: '',
      defaultChannel: 'production',
      appReadyTimeout: 30000,
      publicKey: '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAwaBVBlWbFukKdfB5DFb+kHJ3YT/uD6A0LWtWK4FQhavClTx9erlv\nxp5V9TvV1/xtUGC1G1aDNdmbklOmKKaa4UPb9o6RlYt43KNwtBQ8Y7FRU4g7O7XO\nxVR2O/A5+wMQNGVsjQEnxfC5uEVCfzVypBP39xDk4cDwxBPX4lx87yVnExOpkcbS\nZ6uKsHrnLoIr0CTb+uUXbg1oQRwTiNcm0BhvCHK2EDXjjupr83yTwxtut9xETGqB\nnoEbMex7OIo8z7SBPSM2hBBEX5qDCtJEJC0lJHfPewC5ErNKcZbM6z6WllllIifn\n+DvtZ8ycO5VkbpcBdrUZvMzN8v8gSoAAfQIDAQAB\n-----END RSA PUBLIC KEY-----\n'
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'nimiq-pay-sqlite',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Nimiq Pay'
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Nimiq Pay',
        biometricSubTitle: 'Log in using your biometric'
      }
    },
    PushNotifications: {
      presentationOptions: [
        'badge',
        'sound',
        'alert'
      ]
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_name'
    },
    PrivacyScreen: {
      enable: false,
      preventScreenshots: false
    },
    Posthog: {
      apiKey: 'phc_Ar1vGHvWGTZDBG4m5VM9KkpOW6lFkV3fVqUocmoJ2DR',
      host: 'https://eu.i.posthog.com',
      enableSessionReplay: false,
      autoCaptureExceptions: true
    },
    SystemBars: {
      insetsHandling: 'disable'
    }
  }
};

export default config;
