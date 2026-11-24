import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  device: { isIOS: false, isWeb: false },
  createApp: vi.fn(),
  use: vi.fn(),
  mount: vi.fn(),
  notifyAppReady: vi.fn(),
  initDb: vi.fn(),
  initWasm: vi.fn(),
  initClient: vi.fn(),
  router: { beforeEach: vi.fn(), beforeResolve: vi.fn(), onError: vi.fn(), isReady: vi.fn() },
  isWasmAvailable: vi.fn(),
  error: vi.fn(),
  identifyUser: vi.fn(),
  trackCurrentAppOpen: vi.fn(),
  reportCriticalError: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => !mocks.device.isWeb } }))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: { notifyAppReady: mocks.notifyAppReady } }))
vi.mock('@ionic/vue', () => ({ IonicVue: {} }))
vi.mock('@vue/devtools', () => ({ devtools: { connect: vi.fn() } }))
vi.mock('capacitor-lockdown-mode', () => ({ LockdownMode: { isLockdownModeEnabled: async () => ({}) } }))
vi.mock('jeep-sqlite/dist/components/jeep-sqlite', () => ({ JeepSqlite: class {} }))
vi.mock('vue', () => ({ createApp: mocks.createApp }))
vi.mock('pinia', () => ({ createPinia: vi.fn(), storeToRefs: () => ({ language: { value: 'en' } }) }))
vi.mock('vue-virtual-scroller', () => ({ default: {} }))
vi.mock('@/composables/useDecrypt', () => ({ useDecrypt: vi.fn() }))
vi.mock('@/composables/useDevice', () => ({ useDevice: () => mocks.device }))
vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ init: vi.fn(), log: vi.fn(), error: mocks.error }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18nRegistration: {}, setLanguage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/analytics', () => ({ identifyUser: mocks.identifyUser, reportCriticalError: mocks.reportCriticalError, trackCurrentAppOpen: mocks.trackCurrentAppOpen }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/lib/node-globals', () => ({ installNodeGlobals: vi.fn() }))
vi.mock('@/lib/utils', () => ({ isWasmAvailable: mocks.isWasmAvailable }))
vi.mock('@/stores/app', () => ({ useApp: vi.fn() }))
vi.mock('@/stores/conn', () => ({ useConn: () => ({ init: mocks.initDb }) }))
vi.mock('@/stores/nimiq-network', () => ({ useNimiqNetwork: () => ({ initWasm: mocks.initWasm, initClient: mocks.initClient }) }))
vi.mock('@/stores/mini-apps', () => ({ useMiniApps: vi.fn() }))
vi.mock('./App.vue', () => ({ default: { name: 'App' } }))
vi.mock('./views/LockdownScreen.vue', () => ({ default: { name: 'LockdownScreen' } }))
vi.mock('./router', () => ({ default: mocks.router }))

describe('ota startup confirmation', () => {
  let startup: () => Promise<void>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.createApp.mockReturnValue({ use: mocks.use, mount: mocks.mount })
    mocks.device.isIOS = false
    mocks.device.isWeb = false
    mocks.initDb.mockResolvedValue(undefined)
    mocks.identifyUser.mockResolvedValue(undefined)
    mocks.initWasm.mockResolvedValue(true)
    mocks.router.isReady.mockResolvedValue(undefined)
    mocks.notifyAppReady.mockResolvedValue({})
    mocks.isWasmAvailable.mockReturnValue(true)
    vi.spyOn(customElements, 'define').mockImplementation(() => {})
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'DOMContentLoaded')
        startup = listener as unknown as () => Promise<void>
    })
    await import('./main')
  })

  afterEach(() => vi.restoreAllMocks())

  it('reports the cold start only after identify registers the bundle version', async () => {
    let finishIdentify!: () => void
    mocks.identifyUser.mockReturnValueOnce(new Promise<void>(resolve => finishIdentify = resolve))

    await startup()
    expect(mocks.trackCurrentAppOpen).not.toHaveBeenCalled()

    finishIdentify()
    await vi.waitFor(() => expect(mocks.trackCurrentAppOpen).toHaveBeenCalledWith('cold_start'))
  })

  it('confirms a native bundle only after routing and mounting succeed', async () => {
    const ready = Promise.withResolvers<void>()
    mocks.router.isReady.mockReturnValue(ready.promise)

    const boot = startup()
    await vi.waitFor(() => expect(mocks.router.isReady).toHaveBeenCalledOnce())
    expect(mocks.notifyAppReady).not.toHaveBeenCalled()
    expect(mocks.mount).not.toHaveBeenCalled()

    ready.resolve()
    await boot
    expect(mocks.notifyAppReady).toHaveBeenCalledOnce()
    expect(mocks.mount.mock.invocationCallOrder[0]).toBeLessThan(mocks.notifyAppReady.mock.invocationCallOrder[0]!)
  })

  it('loads the Nimiq wasm alongside the database and routes only after it is ready', async () => {
    const wasm = Promise.withResolvers<boolean>()
    mocks.initWasm.mockReturnValue(wasm.promise)

    const boot = startup()
    await vi.waitFor(() => expect(mocks.router.onError).toHaveBeenCalledOnce())
    await new Promise(resolve => setTimeout(resolve))
    expect(mocks.use).not.toHaveBeenCalledWith(mocks.router)
    expect(mocks.router.isReady).not.toHaveBeenCalled()
    expect(mocks.initClient).not.toHaveBeenCalled()
    expect(mocks.initWasm.mock.invocationCallOrder[0]).toBeLessThan(mocks.initDb.mock.invocationCallOrder[0]!)

    wasm.resolve(true)
    await boot
    expect(mocks.use).toHaveBeenCalledWith(mocks.router)
    expect(mocks.initClient).toHaveBeenCalledOnce()
    expect(mocks.mount).toHaveBeenCalledOnce()
  })

  it('shows the startup error screen without routing or confirming when the wasm fails to load', async () => {
    mocks.initWasm.mockResolvedValue(false)

    await startup()
    expect(mocks.createApp).toHaveBeenLastCalledWith({ name: 'LockdownScreen' }, { startupFailed: true })
    expect(mocks.mount).toHaveBeenCalledOnce()
    expect(mocks.use).not.toHaveBeenCalledWith(mocks.router)
    expect(mocks.router.isReady).not.toHaveBeenCalled()
    expect(mocks.initClient).not.toHaveBeenCalled()
    expect(mocks.notifyAppReady).not.toHaveBeenCalled()
  })

  it('reports failed navigations', async () => {
    await startup()
    const error = new Error('undefined is not an object (evaluating \'wasm.policy_blocks_per_batch\')')

    mocks.router.onError.mock.calls[0]![0](error)
    expect(mocks.reportCriticalError).toHaveBeenCalledWith(error, { context: 'router-navigation' })
  })

  it('leaves a failed startup unconfirmed so native rollback can recover', async () => {
    mocks.initDb.mockRejectedValue(new Error('Database initialization failed'))

    await expect(startup()).rejects.toThrow('Database initialization failed')
    expect(mocks.notifyAppReady).not.toHaveBeenCalled()
  })

  it('confirms the intentional iOS Lockdown screen after mounting', async () => {
    mocks.device.isIOS = true
    mocks.isWasmAvailable.mockReturnValue(false)

    await startup()
    expect(mocks.notifyAppReady).toHaveBeenCalledOnce()
    expect(mocks.mount.mock.invocationCallOrder[0]).toBeLessThan(mocks.notifyAppReady.mock.invocationCallOrder[0]!)
    expect(mocks.initDb).not.toHaveBeenCalled()
  })

  it('does not call the native updater in the browser', async () => {
    mocks.device.isWeb = true

    await startup()
    expect(mocks.mount).toHaveBeenCalledOnce()
    expect(mocks.notifyAppReady).not.toHaveBeenCalled()
  })

  it('logs a failed confirmation without breaking the mounted app', async () => {
    const error = new Error('Native bridge unavailable')
    mocks.notifyAppReady.mockRejectedValue(error)

    await expect(startup()).resolves.toBeUndefined()
    expect(mocks.mount).toHaveBeenCalledOnce()
    expect(mocks.error).toHaveBeenCalledWith('Failed to confirm OTA startup', error)
  })
})
