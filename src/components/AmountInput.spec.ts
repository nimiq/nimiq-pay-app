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

async function mountAmountInput(props?: Record<string, unknown>) {
  const { default: AmountInput } = await import('./AmountInput.vue')

  return mount(AmountInput, {
    props,
    global: {
      plugins: [createPinia()],
    },
  })
}

describe('amountInput', () => {
  beforeEach(() => {
    selectedFiat.value = 'USD'
  })

  it('shows the selected fiat as the default suffix', async () => {
    const wrapper = await mountAmountInput()

    expect(wrapper.findAll('span').at(-1)?.text()).toBe('USD')
  })

  it('uses the provided suffix instead of the selected fiat', async () => {
    const wrapper = await mountAmountInput({ suffix: 'USDT' })

    expect(wrapper.findAll('span').at(-1)?.text()).toBe('USDT')
  })

  it('renders a text input with decimal keyboard hinting', async () => {
    const wrapper = await mountAmountInput()
    const input = wrapper.get('input')

    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('inputmode')).toBe('decimal')
  })

  it('normalizes comma decimals before emitting model updates', async () => {
    const wrapper = await mountAmountInput({ decimals: 2 })
    const input = wrapper.get('input')

    await input.setValue('1,2')

    expect((input.element as HTMLInputElement).value).toBe('1.2')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([120])
  })

  it('keeps a trailing decimal separator while the user is still typing', async () => {
    const wrapper = await mountAmountInput({ decimals: 2 })
    const input = wrapper.get('input')

    await input.setValue('1,')

    expect((input.element as HTMLInputElement).value).toBe('1.')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])
  })
})
