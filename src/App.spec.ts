import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const listeners = vi.hoisted(() => new Map<string, (...args: any[]) => unknown>())
const decrypted = ref(false)
const isAppStarting = ref(false)
const isAppInBackground = ref(false)
const refreshFromDb = vi.fn()
const updateTransactionHistory = vi.fn()

enableAutoUnmount(afterEach)

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event: string, handler: (...args: any[]) => unknown) => listeners.set(event, handler)),
    getInfo: vi.fn().mockResolvedValue({ version: 'test', build: '1' }),
  },
}))
vi.mock('@capacitor/core', () => ({ SystemBars: {}, SystemBarsStyle: {} }))
vi.mock('@capacitor/screen-orientation', () => ({ ScreenOrientation: {} }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: {} }))
vi.mock('@capawesome/capacitor-android-edge-to-edge-support', () => ({ EdgeToEdge: {} }))
vi.mock('@capawesome/capacitor-posthog', () => ({ Posthog: { reloadFeatureFlags: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@capgo/camera-preview', () => ({ CameraPreview: { stop: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('capacitor-extended-dialog', () => ({ ExtendedDialog: { dismissLoading: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@ionic/vue', () => ({
  IonApp: defineComponent({ template: '<div><slot /></div>' }),
  IonFab: defineComponent({ template: '<div><slot /></div>' }),
  IonFabButton: defineComponent({ template: '<button><slot /></button>' }),
  IonIcon: defineComponent({ template: '<i />' }),
  IonRouterOutlet: defineComponent({ template: '<div />' }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ go: vi.fn() }) }))
vi.mock('@/components/NetworkOverrideBadge.vue', () => ({ default: defineComponent({ template: '<div />' }) }))
vi.mock('@/composables/useDecrypt', () => ({ useDecrypt: () => ({ decrypted }) }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => ({ isWeb: true }) }))
vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), error: vi.fn(), forceSaveToFile: vi.fn() }),
}))
vi.mock('@/composables/useModal', () => ({ Modal: {}, useModal: () => ({ showModal: vi.fn() }) }))
vi.mock('@/composables/useApi', () => ({
  useRemoteSignerApi: () => ({ getStatus: vi.fn().mockResolvedValue({ hasError: true }) }),
}))
vi.mock('@/lib/analytics', () => ({ trackCurrentAppOpen: vi.fn() }))
vi.mock('@/lib/index', () => ({ isDev: false }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ reopenMiniAppWebviewAfterResume: ref(false) }) }))
vi.mock('@/stores/feature-flags', () => ({
  useFeatureFlags: () => ({ refreshUsdtMaintenance: vi.fn(), refreshCryptocityPoints: vi.fn() }),
}))
vi.mock('@/stores/locks', () => ({ useLocks: () => ({ isAppStarting, isAppInBackground }) }))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => ({ height: ref(0), reconnect: vi.fn() }) }))
vi.mock('@/stores/transactions', () => ({ useTransactions: () => ({ refreshFromDb }) }))
vi.mock('@/stores/sync', () => ({ useSync: () => ({ updateTransactionHistory }) }))

async function resumeApp() {
  mount((await import('./App.vue')).default)
  await listeners.get('resume')!()
  await flushPromises()
}

describe('app resume', () => {
  beforeEach(() => {
    listeners.clear()
    refreshFromDb.mockReset()
    updateTransactionHistory.mockReset()
    isAppStarting.value = false
  })

  // Biometric unlock resumes the app on the PIN screen. Loading transactions then reads the
  // wallet address before its keys are loaded, and the failed load leaves the home list empty.
  it('does not load transactions while the wallet is locked', async () => {
    decrypted.value = false

    await resumeApp()

    expect(refreshFromDb).not.toHaveBeenCalled()
    expect(updateTransactionHistory).not.toHaveBeenCalled()
  })

  it('loads cached transactions and syncs history once unlocked', async () => {
    decrypted.value = true

    await resumeApp()

    expect(refreshFromDb).toHaveBeenCalledOnce()
    expect(updateTransactionHistory).toHaveBeenCalledOnce()
  })
})
