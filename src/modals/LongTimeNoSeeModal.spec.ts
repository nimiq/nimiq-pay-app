import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { debounceMaxWait } from '@/lib'

const closeModal = vi.fn()
const consensus = shallowRef('connecting')
const isHtlcRecreating = shallowRef(false)
const hasHtlcExpired = shallowRef<boolean | undefined>(true)
const isHtlcActive = shallowRef(false)
const blocksUntilNextMacroBlock = shallowRef(30)
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
    modalController: { getTop: vi.fn(async () => Array.from(document.querySelectorAll('ion-modal:not(.overlay-hidden)')).at(-1)) },
  }
})

vi.mock('ionicons/icons', () => ({ close: 'close-icon' }))

vi.mock('@/composables/useModal', () => ({ useModal: () => ({ closeModal }) }))

vi.mock('@/stores/nimiq-network', () => ({
  useNimiqNetwork: defineStore('nimiq-network', () => ({ consensus })),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: defineStore('remote-signer', () => ({ isHtlcRecreating, hasHtlcExpired, isHtlcActive })),
}))

vi.mock('@/stores/sync', () => ({
  useSync: defineStore('sync', () => ({ blocksUntilNextMacroBlock })),
}))

async function mountModal() {
  const { default: LongTimeNoSeeModal } = await import('./LongTimeNoSeeModal.vue')
  const wrapper = mount(LongTimeNoSeeModal, { attachTo: selfModal, global: { mocks: { $t: (key: string) => key } } })
  selfModal.classList.remove('overlay-hidden')
  return wrapper
}

describe('longTimeNoSeeModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Nimiq', { Policy: { BLOCKS_PER_BATCH: 60 } })
    setActivePinia(createPinia())
    closeModal.mockReset()
    consensus.value = 'connecting'
    isHtlcRecreating.value = false
    hasHtlcExpired.value = true
    isHtlcActive.value = false
    document.body.appendChild(document.createElement('ion-modal'))
    // Ionic mounts the contents while their owning overlay is still hidden.
    selfModal = document.createElement('ion-modal')
    selfModal.classList.add('overlay-hidden')
    document.body.appendChild(selfModal)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.querySelectorAll('ion-modal').forEach(modal => modal.remove())
  })

  it('closes itself, not the modal underneath, once the connection is refreshed', async () => {
    await mountModal()
    await vi.advanceTimersByTimeAsync(debounceMaxWait)
    expect(closeModal).not.toHaveBeenCalled()

    consensus.value = 'established'
    hasHtlcExpired.value = false
    isHtlcActive.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(debounceMaxWait)

    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself, not the modal underneath, when X is tapped', async () => {
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)

    await wrapper.find('button').trigger('click')

    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal, role: 'cancel' })
  })

  it('stays open while the connection is still refreshing', async () => {
    consensus.value = 'established'
    hasHtlcExpired.value = false
    await mountModal()

    await vi.advanceTimersByTimeAsync(debounceMaxWait)

    expect(closeModal).not.toHaveBeenCalled()
  })
})
