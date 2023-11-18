import { isPlatform } from '@ionic/vue'

export function useDevice() {
  return {
    isWeb: isPlatform('desktop') || isPlatform('mobileweb'),
    isAndroid: isPlatform('android') && !isPlatform('mobileweb'),
    isIOS: isPlatform('ios') && !isPlatform('mobileweb'),
    locale: navigator.language,
  }
}
