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

function translate(value: string, params: Record<string, unknown> = {}) {
  return Object.entries(params).reduce((text, [key, replacement]) => text.replace(`{${key}}`, String(replacement)), value)
}

function miniAppsResponse(): { status: number, data: unknown } {
  return {
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
  }
}

function competitionFeedResponse(): { status: number, data: unknown } {
  return {
    status: 200,
    data: {
      generated_at: '2026-07-22T11:22:14.251Z',
      commit: '457ce53',
      apps: [{
        cycle: 'cycle2',
        app_name: 'Roundtrip',
        category: 'Productivity',
        tagline: 'Split the trip. Settle in a tap.',
        description: 'Track shared expenses and settle in NIM.',
        pricing: 'Free',
        url: 'https://roundtrip.example/',
        repo_url: 'https://github.com/example/roundtrip',
        video_url: null,
        icon: 'https://assets.example/icon.png',
        thumbnail: 'https://assets.example/thumbnail.png',
        screenshots: [],
        github_login: 'builder',
        x_account: null,
        team_name: null,
        team_members: [],
        submitted_at: '2026-07-10T12:36:19.329Z',
      }],
    },
  }
}

const {
  addListener,
  browserOpen,
  capacitorHttpGet,
  clearAllCookies,
  fetchPageDescription,
  getFaviconUrl,
  hostDestroy,
  isDevState,
  miniAppActiveState,
  loggerError,
  loggerLog,
  openWebView,
  screenOrientationLock,
  screenOrientationUnlock,
  setToast,
  trackDAppClosed,
  trackFeatureOpened,
  trackDAppOpened,
} = vi.hoisted(() => ({
  openWebView: vi.fn(() => Promise.resolve()),
  browserOpen: vi.fn(() => Promise.resolve()),
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
  trackFeatureOpened: vi.fn(),
  trackDAppOpened: vi.fn(),
  isDevState: { value: false },
  miniAppActiveState: { value: false },
  capacitorHttpGet: vi.fn((_options?: { url: string }): Promise<{ status: number, data: unknown }> => Promise.resolve({ status: 200, data: {} })),
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

vi.mock('@capacitor/browser', () => ({
  Browser: { open: browserOpen },
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
    close: vi.fn(() => Promise.resolve()),
  },
  ToolBarType: {
    NAVIGATION: 'navigation',
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    error: loggerError,
    log: loggerLog,
    warn: vi.fn(),
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    setToast,
    clearToast: vi.fn(),
  }),
}))

vi.mock('@/composables/useMiniAppHost', async () => {
  return {
    isMiniAppActive: miniAppActiveState,
    MiniAppHost: class {
      destroy = hostDestroy
    },
  }
})

vi.mock('@/lib/mini-app-confirmation', () => ({
  requestUserConfirmation: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/lib/site-metadata', () => ({
  fetchPageDescription,
  getFaviconUrl,
  fetchBestIcon: vi.fn(() => Promise.resolve(undefined)),
  getGoogleFaviconUrl: (url: string) => `https://t2.gstatic.com/faviconV2?url=${encodeURIComponent(url)}`,
}))

vi.mock('@/lib/analytics', () => ({
  trackDAppClosed,
  trackFeatureOpened,
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

const IonBackButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)">Back</button>',
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
      mocks: { $t: translate },
      stubs: {
        ModalTemplate: {
          props: { scrollY: { type: Boolean, default: true } },
          template: '<div data-testid="modal-template" :data-scroll-y="String(scrollY)"><slot name="leftButton" /><slot /></div>',
        },
        IonSearchbar: IonSearchbarStub,
        IonBackButton: IonBackButtonStub,
        IonButtons: { template: '<div><slot /></div>' },
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

function getHardwareBackHandler() {
  let handler: ((processNextHandler: () => void) => void) | undefined
  document.dispatchEvent(new CustomEvent('ionBackButton', {
    detail: {
      register: (_priority: number, registeredHandler: typeof handler) => {
        handler = registeredHandler
      },
    },
  }))
  return handler
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
    browserOpen.mockReset()
    browserOpen.mockImplementation(() => Promise.resolve())
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
    trackFeatureOpened.mockReset()
    trackDAppOpened.mockReset()
    isDevState.value = false
    miniAppActiveState.value = false
    capacitorHttpGet.mockReset()
    capacitorHttpGet.mockImplementation(options => Promise.resolve(
      options?.url.includes('miniappscompetition-submissions') ? competitionFeedResponse() : miniAppsResponse(),
    ))

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ text: () => Promise.resolve('window.__provider = true') })))
  })

  it('keeps the Mini Apps modal open when hardware back closes an active Mini App', () => {
    miniAppActiveState.value = true
    const wrapper = mountModal()
    const processNextHandler = vi.fn()
    const hardwareBackHandler = getHardwareBackHandler()

    expect(hardwareBackHandler).toBeDefined()
    hardwareBackHandler!(processNextHandler)

    expect(processNextHandler).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the Mini Apps modal open on hardware back from the Apps list', () => {
    const wrapper = mountModal()
    const processNextHandler = vi.fn()
    const hardwareBackHandler = getHardwareBackHandler()

    expect(hardwareBackHandler).toBeDefined()
    hardwareBackHandler!(processNextHandler)

    expect(processNextHandler).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('moves back one competition flow step on hardware back', async () => {
    const wrapper = mountModal()
    await flushPromises()
    const processNextHandler = vi.fn()
    const hardwareBackHandler = getHardwareBackHandler()

    await wrapper.find('[data-testid="competition-spotlight"]').trigger('click')
    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()

    hardwareBackHandler!(processNextHandler)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('false')

    hardwareBackHandler!(processNextHandler)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mini-apps-flow-apps"]').attributes('aria-hidden')).toBe('false')
    expect(processNextHandler).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('moves from Mini Apps to entries and detail, then returns one flow step at a time', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const spotlight = wrapper.find('[data-testid="competition-spotlight"]')
    expect(spotlight.exists()).toBe(true)
    expect(spotlight.text()).toContain('Cycle 2')
    expect(spotlight.text()).toContain('1 entries')
    const appsStep = wrapper.find('[data-testid="mini-apps-flow-apps"]').element as HTMLElement
    appsStep.scrollTop = 96

    await spotlight.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-apps-flow-apps"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('false')
    expect(wrapper.find('[data-testid="competition-submission-count"]').text()).toBe('1')
    expect(trackFeatureOpened).toHaveBeenCalledWith(expect.objectContaining({
      featureName: 'mini_apps',
      source: 'competition_spotlight',
      channel: 'flow',
    }))

    const competitionScroller = wrapper.find('.competition-scroll').element as HTMLElement
    competitionScroller.scrollTop = 128
    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-testid="mini-apps-flow-competition-detail"]').attributes('aria-hidden')).toBe('false')
    expect(wrapper.find('[data-testid="competition-detail"]').text()).toContain('Track shared expenses and settle in NIM.')

    await wrapper.find('[data-testid="competition-flow-back"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-apps-flow-apps"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('false')
    expect(wrapper.find('[data-testid="mini-apps-flow-competition-detail"]').attributes('aria-hidden')).toBe('true')
    expect(competitionScroller.scrollTop).toBe(128)

    await wrapper.find('[data-testid="competition-flow-back"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-apps-flow-apps"]').attributes('aria-hidden')).toBe('false')
    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('true')
    expect(appsStep.scrollTop).toBe(96)
  })

  it('registers every flow scroller with Ionic sheet gesture boundaries', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('[data-testid="modal-template"]').attributes('data-scroll-y')).toBe('false')
    expect(wrapper.find('[data-testid="mini-apps-flow-apps"]').classes()).toContain('ion-content-scroll-host')

    await wrapper.find('[data-testid="competition-spotlight"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.competition-scroll').classes()).toContain('ion-content-scroll-host')

    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="competition-detail-scroll"]').classes()).toContain('ion-content-scroll-host')
  })

  it('does not transform the shared ancestor of the independent vertical scrollers', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('[data-testid="competition-spotlight"]').trigger('click')
    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()

    const flowTrack = wrapper.find('.mini-apps-flow').element.firstElementChild as HTMLElement
    await vi.waitFor(() => {
      expect(flowTrack.style.transform).toBe('')
      expect(flowTrack.style.marginLeft).not.toBe('')
    })
  })

  it('opens competition links and launches the selected entry from its detail step', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('[data-testid="competition-spotlight"]').trigger('click')
    await wrapper.find('[data-testid="competition-entry-0"]').trigger('click')
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('Source code'))!.trigger('click')
    expect(browserOpen).toHaveBeenCalledWith({
      url: 'https://github.com/example/roundtrip',
      toolbarColor: '#0582CA',
    })

    await wrapper.find('[data-testid="competition-open"]').trigger('click')
    await flushPromises()

    expect(openWebView).toHaveBeenCalledTimes(1)
    expect(trackDAppOpened).toHaveBeenCalledWith('https://roundtrip.example/', 'Roundtrip', 'competition')
  })

  it('advances to competition while the feed is loading', async () => {
    const competitionResponse = createDeferred<{ status: number, data: unknown }>()
    const defaultResponse = capacitorHttpGet.getMockImplementation()!
    capacitorHttpGet.mockImplementation(options => options?.url.includes('miniappscompetition-submissions')
      ? competitionResponse.promise
      : defaultResponse(options))
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('[data-testid="competition-spotlight-loading"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mini-apps-flow-competition"]').attributes('aria-hidden')).toBe('false')
    expect(wrapper.find('[data-testid="competition-loading"]').exists()).toBe(true)
    competitionResponse.resolve({ status: 200, data: { apps: [] } })
    await flushPromises()
  })

  it('keeps competition entries out of search and hides the spotlight for EVM', async () => {
    const wrapper = mountModal()
    await flushPromises()

    await wrapper.find('input').setValue('Roundtrip')
    await flushPromises()
    expect(wrapper.find('[data-testid="competition-spotlight"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="dapp-button-https-roundtrip-example"]').exists()).toBe(false)

    await wrapper.find('input').setValue('')
    await wrapper.findAll('[role="radio"]').find(item => item.text() === 'EVM')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="competition-spotlight"]').exists()).toBe(false)
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

  it('falls back through the Google favicon, then to the fallback icon, when image loading fails', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const uniswapIcon = wrapper.find('[data-testid="dapp-button-https-app-uniswap-org"] img')
    await uniswapIcon.trigger('error')
    expect((uniswapIcon.element as HTMLImageElement).src).toContain('t2.gstatic.com')

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

  it('builds the report url only for awesome-list apps', async () => {
    mountModal()
    await flushPromises()

    const { useMiniApps } = await import('@/stores/mini-apps')
    const store = useMiniApps()

    expect(store.getMiniAppReportUrl('https://evm-mini-wallet.vercel.app/')).toBe('https://nimpay.app/miniapps/evm/evm-mini-wallet/report')
    // Matches regardless of trailing slash, mirroring iconForUrl / isTrustedMiniAppUrl.
    expect(store.getMiniAppReportUrl('https://evm-mini-wallet.vercel.app')).toBe('https://nimpay.app/miniapps/evm/evm-mini-wallet/report')
    expect(store.getMiniAppReportUrl('https://not-in-the-list.example/')).toBeUndefined()
  })

  it('renders the kebab menu trigger on an awesome-list row', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('[data-testid="featured-dapp-menu-https-evm-mini-wallet-vercel-app"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dapp-menu-https-app-uniswap-org"]').exists()).toBe(true)
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
