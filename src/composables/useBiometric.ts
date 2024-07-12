import { createSharedComposable } from '@vueuse/core'
import { computed, ref } from 'vue'
import { AndroidBiometryStrength, BiometricAuth, BiometryError, BiometryErrorType, BiometryType } from '@aparajita/capacitor-biometric-auth'
import type { CheckBiometryResult } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage, StorageError } from '@aparajita/capacitor-secure-storage'
import type { PluginListenerHandle } from '@capacitor/core'
import { storeToRefs } from 'pinia'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { useApp } from '@/stores/app'

const logger = useLogger('useBiometric')
const pinKey = 'pin'

function _useBiometric() {
  const { isBiometricEnabled } = storeToRefs(useApp())
  const biometry = ref<CheckBiometryResult>({
    isAvailable: false,
    strongBiometryIsAvailable: false,
    biometryType: BiometryType.none,
    biometryTypes: [],
    deviceIsSecure: false,
    reason: '',
    code: BiometryErrorType.none,
    strongReason: '',
    strongCode: BiometryErrorType.none,
  })

  /**
   * On iOS, isAvailable and strongBiometryIsAvailable will always have the same value.
   * On Android, isAvailable will be true if any type of biometry is available, but strongBiometryIsAvailable will be true only if strong biometry is available.
   * For example, on a typical device, if the device supports both fingerprint and face authentication, isAvailable will be true if either is enrolled,
   * but strongBiometryIsAvailable will be true only if fingerprint authentication is enrolled.
   */
  const isBiometricSupported = computed(() => biometry.value.strongBiometryIsAvailable)
  const biometricNotSupportedReason = computed(() => biometry.value.reason)
  let appListener: PluginListenerHandle | undefined
  const options = {
    reason: i18n.t('Unlock Nimiq Pay with your biometric data'),
    cancelTitle: i18n.t('Cancel'),
    androidTitle: i18n.t('Biometric Authentication'),
    androidSubtitle: '',
    allowDeviceCredential: false,
    androidConfirmationRequired: true,
    androidBiometryStrength: AndroidBiometryStrength.strong,
  }

  async function updateBiometryInfo() {
    biometry.value = await BiometricAuth.checkBiometry()
  }

  /**
   * Because the availability of biometry can change while the app is in the background, it’s important to check availability when the app resumes.
   * updateBiometryInfo() must be called at least once before calling this method.
   */
  async function addBiometricResumeListener() {
    try {
      appListener = await BiometricAuth.addResumeListener(updateBiometryInfo)
    }
    catch (error) {
      if (error instanceof Error)
        console.error(error.message)
    }
  }

  async function removeBiometricResumeListener() {
    if (appListener) {
      await appListener.remove()
      appListener = undefined
    }
  }

  async function setPinToSecureStorage(pinCode: string) {
    try {
      if (!isBiometricSupported.value)
        return { success: false, error: i18n.t('Biometric is not supported on this device') }

      await BiometricAuth.authenticate(options)
      await SecureStorage.set(pinKey, pinCode)
      return { success: true }
    }
    catch (error) {
      if (error instanceof BiometryError) {
        logger.error(`BiometryError: ${error.code} - ${error.message}`, { biometry: biometry.value })
        return { success: false, error: `${i18n.t('Error using BiometricAuth')}: ${error.message}` }
      }
      else if (error instanceof StorageError) {
        logger.error(`StorageError: ${error.code} - ${error.message}`, { biometry: biometry.value })
        return { success: false, error: `${i18n.t('Error using SecureStorage')}: ${error.message}` }
      }
      else {
        logger.error(error, { biometry: biometry.value })
        return { success: false, error: i18n.t('An unknown error ocurred, biometric cannot be used') }
      }
    }
  }

  async function getPinFromSecureStorage() {
    try {
      if (!isBiometricSupported.value)
        return { success: false, error: i18n.t('Biometric is not supported on this device') }

      if (!isBiometricEnabled.value)
        return { success: false, error: null }

      await BiometricAuth.authenticate(options)
      const pinCode = await SecureStorage.get(pinKey)
      return { success: true, pinCode }
    }
    catch (error) {
      if (error instanceof BiometryError) {
        logger.error(`BiometryError: ${error.code} - ${error.message}`, { biometry: biometry.value })
        // This error message are already in the phone's language
        return { success: false, error: error.message, errorType: error.code }
      }
      else if (error instanceof StorageError) {
        logger.error(`StorageError: ${error.code} - ${error.message}`, { biometry: biometry.value })
        return { success: false, error: `${i18n.t('Error using SecureStorage')}: ${error.message}`, errorType: error.code }
      }
      else {
        logger.error(error, { biometry: biometry.value })
        return { success: false, error: i18n.t('An unknown error ocurred, please manually input your PIN') }
      }
    }
  }

  /**
   * TODO:
   * añadir switch en settings para habilitar biometric (siempre que esté soportado)
   * al activar biometric primero pedir pin y luego activar biometric
   */

  return {
    isBiometricEnabled,
    isBiometricSupported,
    biometricNotSupportedReason,
    updateBiometryInfo,
    addBiometricResumeListener,
    removeBiometricResumeListener,
    setPinToSecureStorage,
    getPinFromSecureStorage,
    BiometryErrorType,
  }
}

export const useBiometric = createSharedComposable(_useBiometric)
