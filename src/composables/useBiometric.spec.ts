import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  biometricAuth: {
    authenticate: vi.fn(async () => {}),
    checkBiometry: vi.fn(async () => ({
      isAvailable: true,
      strongBiometryIsAvailable: true,
      biometryType: 'faceId',
      biometryTypes: ['faceId'],
      deviceIsSecure: true,
      reason: '',
      code: 'none',
      strongReason: '',
      strongCode: 'none',
    })),
    addResumeListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
  isBiometricEnabled: { value: true },
  logger: { error: vi.fn() },
  secureStorage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
}))

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  AndroidBiometryStrength: { strong: 'strong' },
  BiometricAuth: state.biometricAuth,
  BiometryError: class BiometryError extends Error {},
  BiometryErrorType: { none: 'none', userCancel: 'userCancel' },
  BiometryType: { none: 'none' },
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: state.secureStorage,
  StorageError: class StorageError extends Error {},
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (message: string) => message },
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ isBiometricEnabled: state.isBiometricEnabled }),
}))

describe('useBiometric', () => {
  it('disables biometric and asks to re-enable it when auth succeeds without a stored PIN', async () => {
    const { useBiometric } = await import('./useBiometric')
    const biometric = useBiometric()

    await biometric.updateBiometryInfo()
    const result = await biometric.getPinFromSecureStorage()

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong, please re-enable biometric login',
    })
    expect(state.isBiometricEnabled.value).toBe(false)
  })
})
