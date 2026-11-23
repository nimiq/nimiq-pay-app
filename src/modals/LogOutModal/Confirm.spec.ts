import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'

const libState = vi.hoisted(() => ({ isTestnet: false }))
const hasDoneBackup = ref(false)
const remoteBalance = ref(0)
const localBalance = ref(0)
const usdtBalance = ref(0)
let rpcUsdtBalance: number | undefined = 0
const updateUsdtBalance = vi.fn(async () => {
  if (rpcUsdtBalance === undefined)
    return false
  usdtBalance.value = rpcUsdtBalance
  return true
})
const deleteDatabase = vi.fn(async () => {})
const showModal = vi.fn()
const closeModal = vi.fn()
const routerReplace = vi.fn()

vi.mock('@/lib', () => ({
  get isTestnet() {
    return libState.isTestnet
  },
}))

vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: routerReplace }),
}))

vi.mock('@/composables/useModal', () => ({
  Modal: { LogoutWarning: 'LogoutWarning' },
  useModal: () => ({ closeModal, showModal }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({ hasDoneBackup }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({ deleteDatabase }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => ({ remoteBalance }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({ localBalance }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    balance: usdtBalance,
    updateBalance: updateUsdtBalance,
  }),
}))

async function mountConfirm() {
  const { default: Confirm } = await import('./Confirm.vue')
  return mount(Confirm, {
    global: {
      plugins: [createPinia()],
      mocks: { $t: (key: string) => key },
    },
  })
}

async function confirmLogout() {
  const wrapper = await mountConfirm()
  const confirmButton = wrapper.findAll('ion-button').find(button => button.text() === 'Confirm')
  await confirmButton!.trigger('click')
  await flushPromises()
}

async function confirmWithPendingUsdtRead() {
  let resolveRead!: (isFresh: boolean) => void
  updateUsdtBalance.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
    resolveRead = resolve
  }))
  const wrapper = await mountConfirm()
  const confirmButton = wrapper.findAll('ion-button').at(-1)!
  await confirmButton.trigger('click')
  await flushPromises()
  return { wrapper, confirmButton, resolveRead }
}

function expectWarning() {
  expect(showModal).toHaveBeenCalledWith('LogoutWarning', { isOnTop: true, isSmall: true })
  expect(deleteDatabase).not.toHaveBeenCalled()
  expect(routerReplace).not.toHaveBeenCalled()
}

function expectLoggedOut() {
  expect(deleteDatabase).toHaveBeenCalledOnce()
  expect(routerReplace).toHaveBeenCalledWith('/setup')
  expect(showModal).not.toHaveBeenCalled()
}

describe('logOutModal Confirm', () => {
  beforeEach(() => {
    libState.isTestnet = false
    hasDoneBackup.value = false
    remoteBalance.value = 0
    localBalance.value = 0
    usdtBalance.value = 0
    rpcUsdtBalance = 0
    updateUsdtBalance.mockClear()
    deleteDatabase.mockClear()
    showModal.mockClear()
    routerReplace.mockClear()
  })

  it('warns instead of logging out when an unbacked wallet holds only USDT', async () => {
    rpcUsdtBalance = 5

    await confirmLogout()

    expect(updateUsdtBalance).toHaveBeenCalledOnce()
    expectWarning()
  })

  it('reads the USDT balance from the RPC instead of trusting a stale 0', async () => {
    usdtBalance.value = 0
    rpcUsdtBalance = 5

    await confirmLogout()

    expectWarning()
  })

  it('warns when the USDT balance cannot be read', async () => {
    rpcUsdtBalance = undefined

    await confirmLogout()

    expectWarning()
  })

  it('logs out an unbacked wallet when every balance is 0', async () => {
    await confirmLogout()

    expect(updateUsdtBalance).toHaveBeenCalledOnce()
    expectLoggedOut()
  })

  it('warns an unbacked wallet holding NIM without waiting on the USDT RPC', async () => {
    localBalance.value = 10

    await confirmLogout()

    expect(updateUsdtBalance).not.toHaveBeenCalled()
    expectWarning()
  })

  it('always logs out a backed-up wallet without reading the USDT balance', async () => {
    hasDoneBackup.value = true
    remoteBalance.value = 10
    localBalance.value = 10
    usdtBalance.value = 5
    rpcUsdtBalance = undefined

    await confirmLogout()

    expect(updateUsdtBalance).not.toHaveBeenCalled()
    expectLoggedOut()
  })

  it('skips the USDT RPC on testnet, where USDT does not exist', async () => {
    libState.isTestnet = true
    rpcUsdtBalance = undefined

    await confirmLogout()

    expect(updateUsdtBalance).not.toHaveBeenCalled()
    expectLoggedOut()
  })

  it('disables Confirm while the USDT balance is being read', async () => {
    const { wrapper, confirmButton, resolveRead } = await confirmWithPendingUsdtRead()

    expect((confirmButton.element as HTMLIonButtonElement).disabled).toBe(true)
    expect(confirmButton.findComponent(LoadingSpinner).exists()).toBe(true)

    resolveRead(true)
    await flushPromises()
    wrapper.unmount()
  })

  it('does not delete the wallet when the sheet closes during the USDT read', async () => {
    const { wrapper, resolveRead } = await confirmWithPendingUsdtRead()

    wrapper.unmount()
    resolveRead(true)
    await flushPromises()

    expect(deleteDatabase).not.toHaveBeenCalled()
    expect(routerReplace).not.toHaveBeenCalled()
    expect(showModal).not.toHaveBeenCalled()
  })

  it('warns when NIM arrives during the USDT read', async () => {
    const { resolveRead } = await confirmWithPendingUsdtRead()

    localBalance.value = 10
    resolveRead(true)
    await flushPromises()

    expectWarning()
  })
})
