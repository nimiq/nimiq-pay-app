import type { Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { openingMiniAppUrl } from '@/lib/mini-app-launcher'
import MiniAppsModal from './MiniAppsModal.vue'

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const {
  addListener,
  capacitorHttpGet,
  clearAllCookies,
  fetchPageDescription,
  getFaviconUrl,
  hostDestroy,
  isDevState,
  loggerError,
  loggerLog,
  openWebView,
  screenOrientationLock,
  screenOrientationUnlock,
  setToast,
  trackDAppClosed,
  trackDAppOpened,
} = vi.hoisted(() => ({
  openWebView: vi.fn(() => Promise.resolve()),
  addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  clearAllCookies: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  fetchPageDescription: vi.fn(() => Promise.resolve(undefined)),
  getFaviconUrl: vi.fn((url: string) => `https://icons.example/${encodeURIComponent(url)}`),
  hostDestroy: vi.fn(() => Promise.resolve()),
  screenOrientationUnlock: vi.fn(() => Promise.resolve()),
  screenOrientationLock: vi.fn(() => Promise.resolve()),
  trackDAppClosed: vi.fn(),
  trackDAppOpened: vi.fn(),
  isDevState: { value: false },
  capacitorHttpGet: vi.fn(() => Promise.resolve({
    status: 200,
    data: {
      nimiq: [],
      evm: [
        { name: 'EVM Mini Wallet', url: 'https://evm-mini-wallet.vercel.app/', type: 'evm', description: 'Test wallet', logo: '', source: null, developer: null, featured: true, slug: 'evm-mini-wallet' },
        { name: '1inch', url: 'https://1inch.com/', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: '1inch' },
        { name: 'Uniswap', url: 'https://app.uniswap.org', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'uniswap' },
        { name: 'Polymarket', url: 'https://polymarket.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'polymarket' },
        { name: 'OpenSea', url: 'https://opensea.io', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'opensea' },
        { name: 'Aave', url: 'https://app.aave.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'aave' },
        { name: 'DappRadar', url: 'https://dappradar.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'dappradar' },
      ],
    },
  })),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => false,
  },
  CapacitorHttp: {
    get: capacitorHttpGet,
  },
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })), hide: vi.fn(() => Promise.resolve()) },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: vi.fn(() => Promise.resolve()),
    notification: vi.fn(() => Promise.resolve()),
  },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}))

vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: {
    lock: screenOrientationLock,
    unlock: screenOrientationUnlock,
  },
}))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  InAppBrowser: {
    openWebView,
    addListener,
    clearAllCookies,
  },
  ToolBarType: {
    NAVIGATION: 'navigation',
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: loggerError,
    log: loggerLog,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast,
    clearToast: vi.fn(),
  }),
}))

vi.mock('@/composables/useMiniAppHost', () => ({
  MiniAppHost: class {
    destroy = hostDestroy
  },
}))

vi.mock('@/lib/mini-app-confirmation', () => ({
  requestUserConfirmation: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/lib/site-metadata', () => ({
  fetchPageDescription,
  getFaviconUrl,
}))

vi.mock('@/lib/analytics', () => ({
  trackDAppClosed,
  trackDAppOpened,
}))

vi.mock('@/lib', () => ({
  get isDev() {
    return isDevState.value
  },
  isTestnet: false,
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: vi.fn(() => Promise.resolve(undefined)),
    run: vi.fn(() => Promise.resolve()),
  }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: {},
  useModal: () => ({
    showModal: vi.fn(() => Promise.resolve()),
    closeModal: vi.fn(() => Promise.resolve()),
    closeAllModals: vi.fn(() => Promise.resolve()),
  }),
}))

const IonSearchbarStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue', 'keydown.enter'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'keydown.enter\')">',
})

const SwipeToDeleteRowStub = defineComponent({
  inheritAttrs: false,
  props: {
    disabled: { type: Boolean, default: false },
    deleteLabel: { type: String, default: 'Delete' },
    deleteTestid: { type: String, default: undefined },
  },
  emits: ['delete', 'launch'],
  template: `
    <div>
      <button
        v-if="deleteTestid"
        type="button"
        :data-testid="deleteTestid"
        :aria-label="deleteLabel"
        @click="$emit('delete')"
      >Delete</button>
      <div @click="$emit('launch')"><slot /></div>
    </div>
  `,
})

function mountModal(component: Component = MiniAppsModal) {
  return mount(component, {
    global: {
      plugins: [createPinia()],
      stubs: {
        ModalTemplate: {
          template: '<div><slot /></div>',
        },
        IonSearchbar: IonSearchbarStub,
        IonSkeletonText: {
          template: '<div class="skeleton" />',
        },
        AnimatePresence: {
          template: '<div><slot /></div>',
        },
        SwipeToDeleteRow: SwipeToDeleteRowStub,
      },
    },
  })
}

function toUrlTestId(url: string) {
  return url.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

describe('mini apps modal', () => {
  beforeEach(() => {
    // Reset module-scoped guard so prior tests can't leak `openingMiniAppUrl` and
    // short-circuit subsequent launches (production behavior holds the guard until
    // `browserPageLoaded`/`pageLoadError`/`closeEvent` fires, which the mocks never do).
    // Use the static import so we hit the same module instance as MiniAppsModal even
    // after `vi.resetModules()` runs in another test.
    openingMiniAppUrl.value = null

    openWebView.mockReset()
    openWebView.mockImplementation(() => Promise.resolve())
    addListener.mockReset()
    addListener.mockImplementation(() => Promise.resolve({ remove: vi.fn() }))
    clearAllCookies.mockReset()
    clearAllCookies.mockImplementation(() => Promise.resolve())
    setToast.mockReset()
    loggerError.mockReset()
    loggerLog.mockReset()
    fetchPageDescription.mockReset()
    fetchPageDescription.mockImplementation(() => Promise.resolve(undefined))
    getFaviconUrl.mockReset()
    getFaviconUrl.mockImplementation((url: string) => `https://icons.example/${encodeURIComponent(url)}`)
    hostDestroy.mockReset()
    hostDestroy.mockImplementation(() => Promise.resolve())
    screenOrientationUnlock.mockReset()
    screenOrientationUnlock.mockImplementation(() => Promise.resolve())
    screenOrientationLock.mockReset()
    screenOrientationLock.mockImplementation(() => Promise.resolve())
    trackDAppClosed.mockReset()
    trackDAppOpened.mockReset()
    isDevState.value = false
    capacitorHttpGet.mockReset()
    capacitorHttpGet.mockImplementation(() => Promise.resolve({
      status: 200,
      data: {
        nimiq: [],
        evm: [
          { name: 'EVM Mini Wallet', url: 'https://evm-mini-wallet.vercel.app/', type: 'evm', description: 'Test wallet', logo: '', source: null, developer: null, featured: true, slug: 'evm-mini-wallet' },
          { name: '1inch', url: 'https://1inch.com/', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: '1inch' },
          { name: 'Uniswap', url: 'https://app.uniswap.org', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'uniswap' },
          { name: 'Polymarket', url: 'https://polymarket.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'polymarket' },
          { name: 'OpenSea', url: 'https://opensea.io', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'opensea' },
          { name: 'Aave', url: 'https://app.aave.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'aave' },
          { name: 'DappRadar', url: 'https://dappradar.com', type: 'evm', description: '', logo: '', source: null, developer: null, featured: false, slug: 'dappradar' },
        ],
      },
    }))

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ text: () => Promise.resolve('window.__provider = true') })))
  })

  it('blocks repeated taps while first open is pending', async () => {
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const wrapper = mountModal()
    await flushPromises()

    const targetButton = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]')

    await targetButton.trigger('click')
    await flushPromises()
    await targetButton.trigger('click')
    await flushPromises()

    expect(openWebView).toHaveBeenCalledTimes(1)

    deferred.resolve()
    await flushPromises()
  })

  it('locks all app rows while opening', async () => {
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const wrapper = mountModal()
    await flushPromises()

    const allButtons = wrapper.findAll('[data-testid^="dapp-button-"], [data-testid^="featured-dapp-button-"]')

    await allButtons[0].trigger('click')
    await flushPromises()

    for (const button of allButtons) {
      expect(button.attributes('disabled')).toBeDefined()
    }

    deferred.resolve()
    await flushPromises()
  })

  it('shows loading indicator in clicked dapp icon while opening', async () => {
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const wrapper = mountModal()
    await flushPromises()

    const targetButton = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]')

    await targetButton.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="dapp-icon-loading-https-app-uniswap-org"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dapp-icon-loading-https-polymarket-com"]').exists()).toBe(false)

    deferred.resolve()
    await flushPromises()
  })

  it('unlocks and removes loading indicator when opening fails', async () => {
    openWebView.mockRejectedValueOnce(new Error('open failed'))

    const wrapper = mountModal()
    await flushPromises()

    const targetButton = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]')

    await targetButton.trigger('click')
    await flushPromises()

    expect(openWebView).toHaveBeenCalledTimes(1)
    expect(hostDestroy).toHaveBeenCalledTimes(1)
    expect(targetButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="dapp-icon-loading-https-app-uniswap-org"]').exists()).toBe(false)
  })

  it('shows local demo app in development mode', async () => {
    vi.resetModules()
    isDevState.value = true
    const { default: DevMiniAppsModal } = await import('./MiniAppsModal.vue')
    const wrapper = mountModal(DevMiniAppsModal)
    const demoUrl = `http://${__VITE_SERVER_IP__}:5174/`

    await flushPromises()

    expect(wrapper.find(`[data-testid="dapp-button-${toUrlTestId(demoUrl)}"]`).exists()).toBe(true)
  })

  it('falls back to fallback icon when image loading fails', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const uniswapIcon = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"] img')
    await uniswapIcon.trigger('error')

    expect((uniswapIcon.element as HTMLImageElement).src).toContain('data:image/svg+xml')
  })

  it('shows app url when description metadata is unavailable', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const uniswapRow = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]')
    expect(uniswapRow.exists()).toBe(true)
    expect(uniswapRow.text()).toContain('https://app.uniswap.org')
  })

  it('separates featured and non-featured apps into distinct sections', async () => {
    const wrapper = mountModal()
    await flushPromises()

    // Featured section should show EVM Mini Wallet (featured: true)
    expect(wrapper.find('[data-testid="featured-dapp-button-https-evm-mini-wallet-vercel-app"]').exists()).toBe(true)

    // Non-featured section should show Uniswap (featured: false)
    expect(wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]').exists()).toBe(true)

    // Section labels
    const headings = wrapper.findAll('p.text-lg.font-bold')
    const headingTexts = headings.map(h => h.text())
    expect(headingTexts).toContain('Featured Apps')
    expect(headingTexts).toContain('All Apps')
  })

  it('uses description from remote JSON when available', async () => {
    const wrapper = mountModal()
    await flushPromises()

    // EVM Mini Wallet has description 'Test wallet' in mock data
    const featuredButton = wrapper.find('[data-testid="featured-dapp-button-https-evm-mini-wallet-vercel-app"]')
    expect(featuredButton.text()).toContain('Test wallet')
  })

  it('keeps emitting miniapp_opened when opening an app from the marketplace', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('[data-testid="featured-dapp-button-https-evm-mini-wallet-vercel-app"]').trigger('click')
    await flushPromises()

    expect(trackDAppOpened).toHaveBeenCalledWith('https://evm-mini-wallet.vercel.app/', 'EVM Mini Wallet', 'featured')
  })

  it('removes a recently-viewed entry when its delete option is clicked', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const { useMiniApps } = await import('@/stores/mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org', name: 'Uniswap', icon: '' })
    await flushPromises()

    const recentTestId = toUrlTestId('https://app.uniswap.org')
    expect(wrapper.find(`[data-testid="recent-dapp-button-${recentTestId}"]`).exists()).toBe(true)

    await wrapper.find(`[data-testid="recent-dapp-delete-${recentTestId}"]`).trigger('click')
    await flushPromises()

    expect(wrapper.find(`[data-testid="recent-dapp-button-${recentTestId}"]`).exists()).toBe(false)
    expect(store.recentlyViewedDApps.find(d => d.url === 'https://app.uniswap.org')).toBeUndefined()
    expect(openWebView).not.toHaveBeenCalled()
  })

  it('still launches the mini-app when a recently-viewed row body is clicked', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const { useMiniApps } = await import('@/stores/mini-apps')
    const store = useMiniApps()
    store.addRecentlyViewed({ url: 'https://app.uniswap.org', name: 'Uniswap', icon: '' })
    await flushPromises()

    const recentTestId = toUrlTestId('https://app.uniswap.org')
    await wrapper.find(`[data-testid="recent-dapp-button-${recentTestId}"]`).trigger('click')
    await flushPromises()

    expect(openWebView).toHaveBeenCalledTimes(1)
  })

  it('seeds selected user language and fiat into the mini-app preShowScript', async () => {
    const { useApp, Fiat } = await import('@/stores/app')
    const wrapper = mountModal()
    await flushPromises()
    const app = useApp()
    app.language = 'es'
    app.selectedFiat = Fiat.EUR
    await flushPromises()

    await wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"]').trigger('click')
    await flushPromises()

    expect(openWebView).toHaveBeenCalledTimes(1)
    const [[firstArg]] = openWebView.mock.calls as unknown as Array<[{ preShowScript: string }]>
    expect(firstArg.preShowScript).toContain('window.__NIMIQ_PAY__={"lang":"es","userFiat":"EUR"}')
  })
})
