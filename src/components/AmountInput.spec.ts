import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const selectedFiat = ref('USD')

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    selectedFiat,
  }),
}))

describe('amountInput', () => {
  beforeEach(() => {
    selectedFiat.value = 'USD'
  })

  it('shows the selected fiat as the default suffix', async () => {
    const { default: AmountInput } = await import('./AmountInput.vue')
    const wrapper = mount(AmountInput, {
      global: {
        plugins: [createPinia()],
      },
    })

    expect(wrapper.findAll('span').at(-1)?.text()).toBe('USD')
  })

  it('uses the provided suffix instead of the selected fiat', async () => {
    const { default: AmountInput } = await import('./AmountInput.vue')
    const wrapper = mount(AmountInput, {
      props: {
        suffix: 'USDT',
      },
      global: {
        plugins: [createPinia()],
      },
    })

    expect(wrapper.findAll('span').at(-1)?.text()).toBe('USDT')
  })
})
