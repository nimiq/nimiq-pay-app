import type { Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
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
  fetchPageDescription,
  getFaviconUrl,
  hostDestroy,
  isDevState,
  loggerError,
  loggerLog,
  openWebView,
  setToast,
} = vi.hoisted(() => ({
  openWebView: vi.fn(() => Promise.resolve()),
  addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  setToast: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  fetchPageDescription: vi.fn(() => Promise.resolve(undefined)),
  getFaviconUrl: vi.fn((url: string) => `https://icons.example/${encodeURIComponent(url)}`),
  hostDestroy: vi.fn(() => Promise.resolve()),
  isDevState: { value: false },
}))

vi.mock('@capgo/inappbrowser', () => ({
  InAppBrowser: {
    openWebView,
    addListener,
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

vi.mock('@/lib', () => ({
  get isDev() {
    return isDevState.value
  },
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

function mountModal(component: Component = MiniAppsModal) {
  return mount(component, {
    global: {
      stubs: {
        ModalTemplate: {
          template: '<div><slot /></div>',
        },
        IonSearchbar: IonSearchbarStub,
        IonSkeletonText: {
          template: '<div />',
        },
      },
    },
  })
}

describe('mini apps modal', () => {
  beforeEach(() => {
    openWebView.mockReset()
    openWebView.mockImplementation(() => Promise.resolve())
    addListener.mockReset()
    addListener.mockImplementation(() => Promise.resolve({ remove: vi.fn() }))
    setToast.mockReset()
    loggerError.mockReset()
    loggerLog.mockReset()
    fetchPageDescription.mockReset()
    fetchPageDescription.mockImplementation(() => Promise.resolve(undefined))
    getFaviconUrl.mockReset()
    getFaviconUrl.mockImplementation((url: string) => `https://icons.example/${encodeURIComponent(url)}`)
    hostDestroy.mockReset()
    hostDestroy.mockImplementation(() => Promise.resolve())
    isDevState.value = false

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ text: () => Promise.resolve('window.__provider = true') })))
  })

  it('blocks repeated taps while first open is pending', async () => {
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const wrapper = mountModal()
    const targetButton = wrapper.find('[data-testid="featured-dapp-button-https-app-uniswap-org"]')

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
    const featuredButtons = wrapper.findAll('[data-testid^="featured-dapp-button-"]')

    await featuredButtons[0].trigger('click')
    await flushPromises()

    for (const featuredButton of featuredButtons) {
      expect(featuredButton.attributes('disabled')).toBeDefined()
    }

    deferred.resolve()
    await flushPromises()
  })

  it('shows loading indicator in clicked dapp icon while opening', async () => {
    const deferred = createDeferred<void>()
    openWebView.mockImplementationOnce(() => deferred.promise)

    const wrapper = mountModal()
    const targetButton = wrapper.find('[data-testid="featured-dapp-button-https-app-uniswap-org"]')

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
    const targetButton = wrapper.find('[data-testid="featured-dapp-button-https-app-uniswap-org"]')

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

    await flushPromises()

    expect(wrapper.find('[data-testid="featured-dapp-button-http-localhost-5174"]').exists()).toBe(true)
  })

  it('falls back to fallback icon when image loading fails', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const uniswapIcon = wrapper.find('[data-testid="featured-dapp-button-https-app-uniswap-org"] img')
    await uniswapIcon.trigger('error')

    expect((uniswapIcon.element as HTMLImageElement).src).toContain('data:image/svg+xml')
  })

  it('shows app url when description metadata is unavailable', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const uniswapRow = wrapper.find('[data-testid="featured-dapp-button-https-app-uniswap-org"]')
    const subtitle = uniswapRow.find('[data-testid="featured-dapp-subtitle-https-app-uniswap-org"]')

    expect(subtitle.exists()).toBe(true)
    expect(subtitle.text()).toBe('https://app.uniswap.org')
  })
})
