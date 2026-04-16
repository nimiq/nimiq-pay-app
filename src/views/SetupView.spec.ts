import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const initializeFlow = vi.fn()
const trackWalletEntrySelected = vi.fn()

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    template: `<${tag}><slot /></${tag}>`,
  })

  return {
    IonButton: passthrough('button'),
    IonContent: passthrough('div'),
    IonHeader: passthrough('header'),
    IonPage: passthrough('section'),
    IonToolbar: passthrough('div'),
  }
})

vi.mock('@/lib/flows', () => ({
  initializeFlow,
}))

vi.mock('@/lib/flows/steps.types', () => ({
  FlowName: {
    Setup: 'setup',
    SetupWithPromoCode: 'setupWithPromoCode',
    Login: 'login',
  },
}))

vi.mock('@/lib/analytics', () => ({
  trackWalletEntrySelected,
}))

describe('setupView analytics', () => {
  beforeEach(() => {
    initializeFlow.mockReset()
    trackWalletEntrySelected.mockReset()
  })

  it('tracks the create-wallet entry before starting setup', async () => {
    const { default: SetupView } = await import('./SetupView.vue')
    const wrapper = mount(SetupView, {
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await wrapper.findAll('button')[0].trigger('click')

    expect(trackWalletEntrySelected).toHaveBeenCalledWith('create')
    expect(initializeFlow).toHaveBeenCalledWith('setup')
  })

  it('tracks the promo-code entry before starting setupWithPromoCode', async () => {
    const { default: SetupView } = await import('./SetupView.vue')
    const wrapper = mount(SetupView, {
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await wrapper.findAll('button')[1].trigger('click')

    expect(trackWalletEntrySelected).toHaveBeenCalledWith('create_with_promo_code')
    expect(initializeFlow).toHaveBeenCalledWith('setupWithPromoCode')
  })

  it('tracks the import entry before starting login', async () => {
    const { default: SetupView } = await import('./SetupView.vue')
    const wrapper = mount(SetupView, {
      global: {
        mocks: {
          $t: (value: string) => value,
        },
      },
    })

    await wrapper.findAll('button')[2].trigger('click')

    expect(trackWalletEntrySelected).toHaveBeenCalledWith('import')
    expect(initializeFlow).toHaveBeenCalledWith('login')
  })
})
