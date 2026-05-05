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

  it('fills remaining footer slots with recent apps before the rest', async () => {
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

    expect(icons).toEqual(['featured.png', 'zeta.png', 'beta.png'])
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
