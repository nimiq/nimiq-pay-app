import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const showAnimations = ref(false)
const isNimiqAsset = ref(true)
const featuredDApps = ref([
  { name: 'Featured', url: 'https://featured.app', icon: 'featured.png', featured: true },
])
const nonFeaturedDApps = ref([
  { name: 'Alpha', url: 'https://alpha.app', icon: 'alpha.png', featured: false },
  { name: 'Beta', url: 'https://beta.app', icon: 'beta.png', featured: false },
  { name: 'Zeta', url: 'https://zeta.app', icon: 'zeta.png', featured: false },
])
const recentlyViewedDApps = ref([
  { name: 'Zeta', url: 'https://zeta.app', icon: 'zeta.png' },
  { name: 'Beta', url: 'https://beta.app', icon: 'beta.png' },
])
const knownIcons = ref<Record<string, string>>({})
const iconForUrl = (url: string) => knownIcons.value[url.replace(/\/$/, '')]

const showModal = vi.fn()
const initializeFlow = vi.fn()

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({
    template: '<button><slot /></button>',
  }),
}))

vi.mock('motion-v', () => ({
  motion: {
    div: defineComponent({
      template: '<div><slot /></div>',
    }),
  },
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: unknown) => store,
}))

vi.mock('@/components/AssetSwitcher.vue', () => ({
  default: defineComponent({
    template: '<div class="asset-switcher" />',
  }),
}))

vi.mock('@/composables/useDevice', () => ({
  useDevice: () => ({
    isIOS: false,
  }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: {
    MiniApps: 'MiniApps',
  },
  useModal: () => ({
    showModal,
  }),
}))

vi.mock('@/lib', () => ({
  isMiniAppsEnabled: true,
}))

vi.mock('@/lib/flows', () => ({
  initializeFlow,
}))

vi.mock('@/lib/flows/steps.types', () => ({
  FlowName: {
    Payment: 'payment',
  },
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    showAnimations,
    isNimiqAsset,
  }),
}))

vi.mock('@/stores/mini-apps', () => ({
  useMiniApps: () => ({
    featuredDApps,
    nonFeaturedDApps,
    recentlyViewedDApps,
    iconForUrl,
  }),
  stripTrailingSlash: (url: string) => url.replace(/\/$/, ''),
}))

describe('theHomeFooter', () => {
  beforeEach(() => {
    showAnimations.value = false
    isNimiqAsset.value = true
    featuredDApps.value = [
      { name: 'Featured', url: 'https://featured.app', icon: 'featured.png', featured: true },
    ]
    nonFeaturedDApps.value = [
      { name: 'Alpha', url: 'https://alpha.app', icon: 'alpha.png', featured: false },
      { name: 'Beta', url: 'https://beta.app', icon: 'beta.png', featured: false },
      { name: 'Zeta', url: 'https://zeta.app', icon: 'zeta.png', featured: false },
    ]
    recentlyViewedDApps.value = [
      { name: 'Zeta', url: 'https://zeta.app', icon: 'zeta.png' },
      { name: 'Beta', url: 'https://beta.app', icon: 'beta.png' },
    ]
    knownIcons.value = {}
    showModal.mockReset()
    initializeFlow.mockReset()
  })

  it('leads with the most recent Mini App, then featured, then non-featured', async () => {
    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    const icons = wrapper.findAll('img').map(img => img.attributes('src'))

    expect(icons).toEqual(['zeta.png', 'featured.png', 'alpha.png'])
  })

  it('uses only the single most recent app, filling the other two slots with featured', async () => {
    featuredDApps.value = [
      { name: 'Featured1', url: 'https://f1.app', icon: 'f1.png', featured: true },
      { name: 'Featured2', url: 'https://f2.app', icon: 'f2.png', featured: true },
    ]
    recentlyViewedDApps.value = [
      { name: 'Recent1', url: 'https://r1.app', icon: 'r1.png' },
      { name: 'Recent2', url: 'https://r2.app', icon: 'r2.png' },
    ]
    nonFeaturedDApps.value = []

    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    const icons = wrapper.findAll('img').map(img => img.attributes('src'))

    // Only the most recent (r1) leads; r2 is excluded, the other two slots are featured.
    expect(icons).toEqual(['r1.png', 'f1.png', 'f2.png'])
  })

  it('falls back through the Google favicon, then to the globe icon, when a footer image fails to load', async () => {
    const { MINI_APP_FALLBACK_ICON } = await import('@/lib/mini-app-icons')
    const { getGoogleFaviconUrl } = await import('@/lib/site-metadata')
    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    // The most-recent app (zeta) leads; its icon fails to load first.
    const img = wrapper.find('img')
    await img.trigger('error')
    expect(img.attributes('src')).toBe(getGoogleFaviconUrl('https://zeta.app'))

    await img.trigger('error')
    expect(img.attributes('src')).toBe(MINI_APP_FALLBACK_ICON)
  })

  it('sorts the remaining non-featured apps alphabetically when featured and recent buckets are exhausted', async () => {
    recentlyViewedDApps.value = []
    nonFeaturedDApps.value = [
      { name: 'Zeta', url: 'https://zeta.app', icon: 'zeta.png', featured: false },
      { name: 'Alpha', url: 'https://alpha.app', icon: 'alpha.png', featured: false },
      { name: 'Beta', url: 'https://beta.app', icon: 'beta.png', featured: false },
    ]

    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    const icons = wrapper.findAll('img').map(img => img.attributes('src'))

    expect(icons).toEqual(['featured.png', 'alpha.png', 'beta.png'])
  })

  it('prefers the curated nimiq/awesome icon over a recently-viewed favicon when the URL matches', async () => {
    featuredDApps.value = []
    recentlyViewedDApps.value = [
      { name: 'Beta', url: 'https://beta.app', icon: 'https://t2.gstatic.com/faviconV2?url=beta.app' },
    ]
    nonFeaturedDApps.value = []
    knownIcons.value = { 'https://beta.app': 'awesome-beta.png' }

    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    const icons = wrapper.findAll('img').map(img => img.attributes('src'))

    expect(icons).toEqual(['awesome-beta.png'])
  })

  it('passes the analytics source when opening the payment flow', async () => {
    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await wrapper.findAll('button').find(button => button.text() === 'Pay')!.trigger('click')

    expect(initializeFlow).toHaveBeenCalledWith('payment', {
      isFullscreen: true,
      analyticsSource: 'footer_pay_button',
    })
  })

  it('passes modal analytics metadata when opening mini apps', async () => {
    const { default: TheHomeFooter } = await import('./TheHomeFooter.vue')
    const wrapper = mount(TheHomeFooter, {
      props: {
        isPaymentDisabled: false,
      },
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await wrapper.find('[aria-label="Mini Apps"]').trigger('click')

    expect(showModal).toHaveBeenCalledWith('MiniApps', {
      analytics: {
        featureName: 'mini_apps',
        source: 'footer',
      },
    })
  })
})
