import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const dismiss = vi.fn()

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string, attrs: Record<string, unknown> = {}) => defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs: passedAttrs }) {
      return () => h(tag, { ...attrs, ...passedAttrs }, slots.default?.())
    },
  })

  return {
    IonButton: passthrough('button'),
    IonButtons: passthrough('div'),
    IonHeader: passthrough('header'),
    IonIcon: passthrough('span'),
    IonToolbar: passthrough('div'),
    modalController: { dismiss },
  }
})

vi.mock('ionicons/icons', () => ({
  close: 'close-icon',
  warningOutline: 'warning-outline-icon',
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

function $t(key: string, params?: Record<string, unknown>) {
  if (!params)
    return key
  return key.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

const i18nT = defineComponent({
  props: { keypath: { type: String, required: true } },
  setup(props, { slots }) {
    return () => {
      const parts = props.keypath.split(/(\{\w+\})/g)
      return h('span', parts.map((part) => {
        const slotMatch = part.match(/^\{(\w+)\}$/)
        if (slotMatch && slots[slotMatch[1]])
          return slots[slotMatch[1]]!()
        return part
      }))
    }
  },
})

async function mountModal(props: { url: string, rawUrl?: string }) {
  const { default: MiniAppWarningModal } = await import('./MiniAppWarningModal.vue')
  return mount(MiniAppWarningModal, {
    props,
    global: {
      mocks: { $t },
      stubs: { 'i18n-t': i18nT },
    },
  })
}

describe('miniAppWarningModal', () => {
  beforeEach(() => {
    dismiss.mockReset()
  })

  it('renders the hostname and the full URL when the address is safe', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/path' })

    expect(wrapper.text()).toContain('example.com')
    expect(wrapper.text()).toContain('https://example.com/path')
    expect(wrapper.find('[data-test="suspicious-chars"]').exists()).toBe(false)
  })

  it('shows the destructive action above the safe action so the thumb hits Cancel', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/' })

    const buttons = wrapper.findAll('button')
    const labels = buttons.map(b => b.text())
    const openIdx = labels.findIndex(t => t.includes('Open anyway'))
    const cancelIdx = labels.findIndex(t => t.includes('Don\'t open'))

    expect(openIdx).toBeGreaterThanOrEqual(0)
    expect(cancelIdx).toBeGreaterThanOrEqual(0)
    expect(openIdx).toBeLessThan(cancelIdx)
  })

  it('lists each suspicious character with position and reason', async () => {
    // U+0430 Cyrillic 'а' impersonates Latin 'a'
    const wrapper = await mountModal({ url: 'https://exаmple.com/' })

    const list = wrapper.find('[data-test="suspicious-chars"]')
    expect(list.exists()).toBe(true)
    expect(list.text()).toContain('u+0430')
    expect(list.text()).toMatch(/non-ASCII character/i)
  })

  it('renders a placeholder glyph for zero-width characters and explains the reason', async () => {
    const wrapper = await mountModal({ url: 'https://ex​ample.com/' })

    const host = wrapper.find('[data-test="hostname"]')
    expect(host.text()).toContain('␣')

    const list = wrapper.find('[data-test="suspicious-chars"]')
    expect(list.text()).toContain('u+200b')
    expect(list.text()).toMatch(/zero-width/i)
  })

  it('surfaces general warnings (punycode / unparseable) without duplicating per-character entries', async () => {
    const wrapper = await mountModal({ url: 'https://xn--exmple-cua.com/', rawUrl: 'https://xn--exmple-cua.com/' })

    const list = wrapper.find('[data-test="general-warnings"]')
    expect(list.exists()).toBe(true)
    expect(list.text().toLowerCase()).toContain('punycode')
  })

  it('dismisses with confirmed=false and role cancel when the safe action is tapped', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/' })
    const cancel = wrapper.findAll('button').find(b => b.text().includes('Don\'t open'))!
    await cancel.trigger('click')

    expect(dismiss).toHaveBeenCalledWith({ confirmed: false }, 'cancel')
  })

  it('dismisses with confirmed=true and role confirm when the destructive action is tapped', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/' })
    const open = wrapper.findAll('button').find(b => b.text().includes('Open anyway'))!
    await open.trigger('click')

    expect(dismiss).toHaveBeenCalledWith({ confirmed: true }, 'confirm')
  })

  it('exposes alertdialog semantics linking heading and description to the dialog root', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/' })
    const dialog = wrapper.find('[role="alertdialog"]')

    expect(dialog.exists()).toBe(true)

    const labelledBy = dialog.attributes('aria-labelledby')
    const describedBy = dialog.attributes('aria-describedby')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()

    expect(wrapper.find(`#${labelledBy}`).exists()).toBe(true)
    expect(wrapper.find(`#${describedBy}`).exists()).toBe(true)
  })

  it('dismisses with confirmed=false when the header close button is tapped', async () => {
    const wrapper = await mountModal({ url: 'https://example.com/' })
    const closeBtn = wrapper.find('header button')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    expect(dismiss).toHaveBeenCalledWith({ confirmed: false }, 'cancel')
  })

  it('hides decorative icons from assistive technology', async () => {
    const wrapper = await mountModal({ url: 'https://exаmple.com/' })

    const icons = wrapper.findAll('span').filter(el => el.attributes('icon') === 'warning-outline-icon')
    expect(icons.length).toBeGreaterThan(0)
    icons.forEach((icon) => {
      expect(icon.attributes('aria-hidden')).toBe('true')
    })
  })
})
