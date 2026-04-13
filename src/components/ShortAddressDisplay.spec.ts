import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('@nimiq/vue3-components', () => ({
  Identicon: defineComponent({
    props: {
      address: {
        type: String,
        required: true,
      },
    },
    template: '<span data-testid="nim-identicon">{{ address }}</span>',
  }),
}))

vi.mock('@/components/icons/usdt-logo.vue', () => ({
  default: defineComponent({
    template: '<span data-testid="usdt-logo">USDT</span>',
  }),
}))

vi.mock('@/components/icons/horizontal-ellipsis.vue', () => ({
  default: defineComponent({
    template: '<span>...</span>',
  }),
}))

interface ShortAddressDisplayProps {
  address: string
  identiconWidth?: string
  hideIdenticon?: boolean
}

async function mountComponent(props: ShortAddressDisplayProps) {
  const { default: ShortAddressDisplay } = await import('./ShortAddressDisplay.vue')

  return mount(ShortAddressDisplay, { props })
}

describe('shortAddressDisplay', () => {
  it('renders a Nimiq identicon for Nimiq addresses', async () => {
    const wrapper = await mountComponent({ address: 'NQ12 TEST TEST TEST TEST TEST TEST TEST TEST' })

    expect(wrapper.find('[data-testid="nim-identicon"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="usdt-logo"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('NQ12 T')
    expect(wrapper.text()).toContain('T TEST')
  })

  it('renders a smaller USDT logo for polygon addresses', async () => {
    const wrapper = await mountComponent({ address: '0x0000000000000000000000000000000000000001' })

    expect(wrapper.find('[data-testid="usdt-logo"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nim-identicon"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="usdt-logo"]').classes()).toContain('w-8')
    expect(wrapper.text()).toContain('0x0000')
    expect(wrapper.text()).toContain('000001')
  })

  it('hides the asset icon when hideIdenticon is true', async () => {
    const wrapper = await mountComponent({
      address: '0x0000000000000000000000000000000000000001',
      hideIdenticon: true,
    })

    expect(wrapper.find('[data-testid="usdt-logo"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="nim-identicon"]').exists()).toBe(false)
  })
})
