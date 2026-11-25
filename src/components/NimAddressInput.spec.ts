import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

const OWN_NIM_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const OWN_ETH_ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const NIM_SENDER = 'NQ48 JPHQ 7DL8 QF5U 7RNV YTN5 T8XX 36QH 7A7L'
const ETH_SENDER = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
const ETH_SENDER_CHECKSUMMED = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'

const isNimiqAsset = ref(false)
const addNewWithdrawalAddress = vi.fn()

vi.mock('@ionic/vue', () => ({
  IonButton: defineComponent({
    template: '<button v-bind="$attrs"><slot /></button>',
  }),
}))

vi.mock('@nimiq/vue3-components', () => ({
  Identicon: defineComponent({ template: '<span />' }),
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    isNimiqAsset,
    addNewWithdrawalAddress,
  }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: ref({ toUserFriendlyAddress: () => OWN_NIM_ADDRESS }),
    getEthAddress: () => ({ data: OWN_ETH_ADDRESS }),
  }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({
    remoteAddress: ref(undefined),
  }),
}))

vi.mock('@/components/AddressDisplay.vue', () => ({
  default: defineComponent({ template: '<span />' }),
}))

async function mountComponent(props: { saveContact?: boolean, address?: string } = {}) {
  const { default: NimAddressInput } = await import('./NimAddressInput.vue')

  return mount(NimAddressInput, {
    props: {
      saveContact: props.saveContact,
      state: { qrCodeScanner: props.address ?? '' },
    },
    global: {
      mocks: { $t: (value: string) => value },
    },
  })
}

describe('nimAddressInput', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    isNimiqAsset.value = false
    addNewWithdrawalAddress.mockReset()
  })

  it('saves a NIM sender while USDT is active (APP-404)', async () => {
    const wrapper = await mountComponent({ saveContact: true, address: NIM_SENDER })

    expect(wrapper.text()).not.toContain('You can not use this address')
    const save = wrapper.get('button[aria-label="Save"]')
    expect(save.attributes('disabled')).toBeUndefined()

    await save.trigger('click')

    expect(addNewWithdrawalAddress).toHaveBeenCalledWith(NIM_SENDER, '')
    expect(wrapper.emitted('done')).toEqual([[NIM_SENDER]])
  })

  it('saves a 0x sender checksummed while NIM is active (APP-404)', async () => {
    isNimiqAsset.value = true
    const wrapper = await mountComponent({ saveContact: true, address: ETH_SENDER })

    await wrapper.get('button[aria-label="Save"]').trigger('click')

    expect(addNewWithdrawalAddress).toHaveBeenCalledWith(ETH_SENDER_CHECKSUMMED, '')
    expect(wrapper.emitted('done')).toEqual([[ETH_SENDER_CHECKSUMMED]])
  })

  it.each([
    { activeAsset: 'USDT', address: OWN_NIM_ADDRESS },
    { activeAsset: 'NIM', address: OWN_ETH_ADDRESS.toLowerCase() },
  ])('rejects saving the own address $address while $activeAsset is active', async ({ activeAsset, address }) => {
    isNimiqAsset.value = activeAsset === 'NIM'
    const wrapper = await mountComponent({ saveContact: true, address })

    expect(wrapper.text()).toContain('You can not use this address')
    expect(wrapper.get('button[aria-label="Save"]').attributes('disabled')).toBeDefined()
  })

  it('rejects a typed NIM address in the USDT withdrawal input', async () => {
    const wrapper = await mountComponent()

    await wrapper.get('input[aria-label="Address input"]').setValue(NIM_SENDER)

    expect(wrapper.text()).toContain('You can not use this address')
    expect(wrapper.get('button[aria-label="Save"]').attributes('disabled')).toBeDefined()
  })
})
