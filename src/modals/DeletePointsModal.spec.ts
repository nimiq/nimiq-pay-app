import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

interface DeleteResult { success: boolean, error?: string }

const closeModal = vi.fn()
const setToast = vi.fn()
let resolveDelete: (result: DeleteResult) => void
const deleteAccount = vi.fn(() => new Promise<DeleteResult>(resolve => resolveDelete = resolve))
let selfModal: HTMLIonModalElement

vi.mock('@ionic/vue', () => {
  const passthrough = (tag: string) => defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })

  return {
    IonButton: passthrough('button'),
    IonButtons: passthrough('div'),
    IonHeader: passthrough('header'),
    IonIcon: passthrough('span'),
    IonToolbar: passthrough('div'),
  }
})

vi.mock('ionicons/icons', () => ({ close: 'close-icon' }))

vi.mock('@/composables/useModal', () => ({ useModal: () => ({ closeModal }) }))

vi.mock('@/composables/useToast', () => ({ useToast: () => ({ setToast }) }))

vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ error: vi.fn() }) }))

vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (key: string) => key } }))

vi.mock('@/stores/points', () => ({ usePoints: () => ({ deleteAccount }) }))

async function mountModal() {
  const { default: DeletePointsModal } = await import('./DeletePointsModal.vue')
  return mount(DeletePointsModal, { attachTo: selfModal, global: { mocks: { $t: (key: string) => key } } })
}

describe('deletePointsModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    closeModal.mockReset()
    setToast.mockReset()
    deleteAccount.mockClear()
    document.body.appendChild(document.createElement('ion-modal'))
    selfModal = document.createElement('ion-modal')
    document.body.appendChild(selfModal)
  })

  afterEach(() => {
    document.querySelectorAll('ion-modal').forEach(modal => modal.remove())
  })

  it('closes itself, not the modal underneath, once the account is deleted', async () => {
    const wrapper = await mountModal()

    await wrapper.find('button.red-button').trigger('click')
    resolveDelete({ success: true })
    await flushPromises()

    expect(setToast).toHaveBeenCalledWith({ message: 'Points account deleted successfully' })
    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself when X is tapped', async () => {
    const wrapper = await mountModal()

    await wrapper.find('button').trigger('click')

    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('targets only itself when the request ends after it was dismissed', async () => {
    const wrapper = await mountModal()

    await wrapper.find('button.red-button').trigger('click')
    wrapper.unmount()
    resolveDelete({ success: false, error: 'Network error' })
    await flushPromises()

    expect(setToast).toHaveBeenCalledWith({ message: 'Network error', type: 'error' })
    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })
})
