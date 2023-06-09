import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nimiq.pay',
  appName: 'Nimiq Pay',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  loggingBehavior: 'debug',
  appendUserAgent: 'Nimiq Pay',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'nimiq-pay-sqlite',
      iosBiometric: {
        biometricAuth: true,
        biometricTitle : "Biometric login for Nimiq Pay"
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth : true,
        biometricTitle : "Biometric login for Nimiq Pay",
        biometricSubTitle : "Log in using your biometric"
      },
    }
  }
};

export default config;
