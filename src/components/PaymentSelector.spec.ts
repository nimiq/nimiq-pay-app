import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { Asset } from '@/lib/assets'
import { StepName } from '@/lib/flows/steps.types'

const activeAsset = ref(Asset.NIM)
const isNimiqAsset = ref(true)
const isCardActive = ref(true)
const isCardLocked = ref(false)

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (value: string) => value,
  },
}))

vi.mock('@/lib', () => ({
  isNakaEnabled: true,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    activeAsset,
    isNimiqAsset,
  }),
}))

vi.mock('@/stores/naka', () => ({
  useNaka: () => ({
    isCardActive,
    isCardLocked,
  }),
}))

describe('paymentSelector', () => {
  beforeEach(() => {
    activeAsset.value = Asset.NIM
    isNimiqAsset.value = true
    isCardActive.value = true
    isCardLocked.value = false
  })

  it('hides the NAKA option when USDT is the active asset', async () => {
    activeAsset.value = Asset.USDT
    isNimiqAsset.value = false

    const { default: PaymentSelector } = await import('./PaymentSelector.vue')
    const wrapper = mount(PaymentSelector, {
      props: {
        activeStep: {
          step: StepName.QRCodeScanner,
        },
      },
    })

    expect(wrapper.text()).not.toContain('Naka')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
