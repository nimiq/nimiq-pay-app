import { Capacitor } from '@capacitor/core'

export function useDevice() {
  return {
    isWeb: Capacitor.getPlatform() === 'web',
    isAndroid: Capacitor.getPlatform() === 'android',
    isIOS: Capacitor.getPlatform() === 'ios',
    locale: navigator.language,
  }
}
