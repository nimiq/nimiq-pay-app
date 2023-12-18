import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nimiq.pay',
  appName: 'NIM Pay',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*'],
    cleartext: true,
  },
  loggingBehavior: 'debug',
  appendUserAgent: 'NIM Pay',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'nim-pay-sqlite',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for NIM Pay',
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for NIM Pay',
        biometricSubTitle: 'Log in using your biometric',
      },
      bundledWebRuntime: true,
    },
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
  ios: {
    webContentsDebuggingEnabled: true,
  },
}

export default config
