import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import CircularProgress from '@/components/icons/CircularProgress.vue'

const closeModal = vi.fn()
const htlcHistoryChecked = shallowRef<boolean | undefined>(false)
const htlcCheckHoldStartedAt = shallowRef<number | undefined>()
const consensus = shallowRef('established')
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

vi.mock('@/stores/sync', () => ({
  HTLC_HISTORY_CHECK_HOLD_MS: 10 * 60 * 1000,
  useSync: defineStore('sync', () => ({ htlcHistoryChecked, htlcCheckHoldStartedAt })),
}))

function $t(key: string, params?: Record<string, unknown>) {
  if (!params)
    return key
  return key.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

async function mountModal() {
  const { default: HtlcHistoryCheckModal } = await import('./HtlcHistoryCheckModal.vue')
  return mount(HtlcHistoryCheckModal, { attachTo: selfModal, global: { mocks: { $t } } })
}

describe('htlcHistoryCheckModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T14:00:00Z'))
    setActivePinia(createPinia())
    closeModal.mockReset()
    htlcHistoryChecked.value = false
    htlcCheckHoldStartedAt.value = Date.now()
    consensus.value = 'established'
    // Ionic mounts the contents while their owning overlay is still hidden.
    selfModal = document.createElement('ion-modal')
    selfModal.classList.add('overlay-hidden')
    document.body.appendChild(selfModal)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('ion-modal').forEach(modal => modal.remove())
  })

  it('shows how much of the hold has passed and the time left at most', async () => {
    htlcCheckHoldStartedAt.value = Date.now() - 4 * 60 * 1000
    const wrapper = await mountModal()

    expect(wrapper.findComponent(CircularProgress).props()).toMatchObject({ value: 240, max: 600 })
    expect(wrapper.text()).toContain('6 min left at most')
  })

  it('advances the progress while the check runs', async () => {
    const wrapper = await mountModal()

    await vi.advanceTimersByTimeAsync(90_000)

    expect(wrapper.findComponent(CircularProgress).props('value')).toBe(90)
  })

  it('shows that consensus is being established before the check can run', async () => {
    consensus.value = 'connecting'
    const wrapper = await mountModal()

    expect(wrapper.findComponent(CircularProgress).exists()).toBe(false)
    expect(wrapper.text()).toContain('Establishing consensus')
  })

  it('closes itself once the check finishes', async () => {
    await mountModal()
    expect(closeModal).not.toHaveBeenCalled()

    htlcHistoryChecked.value = true
    await nextTick()

    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself once the hold limit releases the funds', async () => {
    await mountModal()

    htlcCheckHoldStartedAt.value = undefined
    await nextTick()

    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself when the check finished while it was loading', async () => {
    htlcHistoryChecked.value = true
    await mountModal()
    await vi.runAllTicks()
    await Promise.resolve()

    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself manually when another modal is underneath', async () => {
    const underlyingModal = document.createElement('ion-modal')
    document.body.insertBefore(underlyingModal, selfModal)
    const wrapper = await mountModal()
    selfModal.classList.remove('overlay-hidden')

    await wrapper.find('button').trigger('click')

    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })

  it('closes itself automatically when another modal is underneath', async () => {
    const underlyingModal = document.createElement('ion-modal')
    document.body.insertBefore(underlyingModal, selfModal)
    await mountModal()
    selfModal.classList.remove('overlay-hidden')

    htlcHistoryChecked.value = true
    await nextTick()

    expect(closeModal).toHaveBeenCalledWith({ modal: selfModal })
  })
})
