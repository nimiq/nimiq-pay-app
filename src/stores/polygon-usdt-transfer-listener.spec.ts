import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { usePolygonUsdt } from './polygon-usdt'

const mocks = vi.hoisted(() => ({
  tokenContracts: [] as Array<{ on: ReturnType<typeof vi.fn>, off: ReturnType<typeof vi.fn> }>,
  blockNumberGates: [] as Array<() => void>,
  ethAddress: null as unknown as import('vue').Ref<string | null>,
  rpcUrl: null as unknown as import('vue').Ref<string>,
}))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>()
  return {
    ...actual,
    // Each provider's first RPC call blocks until the test releases it, to model a slow cold connect.
    JsonRpcProvider: vi.fn(() => ({
      getBlockNumber: vi.fn(() => new Promise<number>(resolve => mocks.blockNumberGates.push(() => resolve(1)))),
    })),
    Contract: vi.fn((address: string, abi) => {
      const contract = {
        interface: new actual.Interface(abi),
        filters: { Transfer: vi.fn((from: string | null, to: string) => ({ from, to })) },
        on: vi.fn(),
        off: vi.fn(),
      }
      if (address === polygonUsdtConfig.tokenContract)
        mocks.tokenContracts.push(contract)
      return contract
    }),
  }
})
vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (text: string) => text } }))
vi.mock('@/lib', () => ({ isTestnet: false }))
vi.mock('@/lib/mock-mode', () => ({ isMockEnabled: false }))
vi.mock('@/lib/analytics', () => ({ trackSwapCompleted: vi.fn(), trackSwapFailed: vi.fn(), trackTopUpReceived: vi.fn() }))
vi.mock('@/stores/feature-flags', async () => {
  const { ref } = await import('vue')
  mocks.rpcUrl = ref('https://polygon-a.example')
  return { useFeatureFlags: () => ({ polygonRpcUrl: mocks.rpcUrl, isUsdtMaintenanceActive: ref(false), usdtMaintenanceNotice: ref('') }) }
})
vi.mock('@/stores/local-wallet', async () => {
  const { ref } = await import('vue')
  mocks.ethAddress = ref(null)
  return { useLocalWallet: () => ({ getEthAddress: () => ({ data: mocks.ethAddress.value }) }) }
})
vi.mock('@/stores/conn', () => ({ useConn: () => ({ query: vi.fn(), run: vi.fn() }) }))
vi.mock('@/stores/app', () => ({ useApp: () => ({ withdrawalAddressesHistory: [] }) }))
vi.mock('@/stores/transactions', () => ({ useTransactions: () => ({}) }))

const ADDRESS_A = '0x00000000000000000000000000000000000000AA'

async function flush() {
  for (let i = 0; i < 10; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
}

async function releaseBlockNumber() {
  await flush()
  mocks.blockNumberGates.shift()?.()
  await flush()
}

describe('polygon-usdt Transfer listener lifecycle', () => {
  let store: ReturnType<typeof usePolygonUsdt>
  let rpcId = 0

  beforeEach(() => {
    mocks.tokenContracts.length = 0
    mocks.blockNumberGates.length = 0
    mocks.ethAddress.value = null
    // The client cache is module-level; a fresh URL per test forces a new client
    mocks.rpcUrl.value = `https://polygon-${++rpcId}.example`
    setActivePinia(createPinia())
    store = usePolygonUsdt()
  })

  afterEach(() => {
    store.$dispose()
  })

  it('does not leave a listener attached when logout happens during the cold connect', async () => {
    mocks.ethAddress.value = ADDRESS_A
    await nextTick()

    // Logout while init() is still waiting on the first RPC call
    mocks.ethAddress.value = null
    await nextTick()
    await releaseBlockNumber()

    const [token] = mocks.tokenContracts
    const attached = token.on.mock.calls.length
    const detached = token.off.mock.calls.length
    expect(attached - detached).toBe(0)
  })

  it('moves the listener to the new client when the RPC URL changes', async () => {
    mocks.ethAddress.value = ADDRESS_A
    await nextTick()
    await releaseBlockNumber()

    const [oldToken] = mocks.tokenContracts
    expect(oldToken.on).toHaveBeenCalledTimes(1)

    mocks.rpcUrl.value = `https://polygon-${++rpcId}.example`
    await nextTick()
    await releaseBlockNumber()

    const [, newToken] = mocks.tokenContracts
    expect(oldToken.off).toHaveBeenCalledWith(oldToken.on.mock.calls[0][0], oldToken.on.mock.calls[0][1])
    expect(newToken.on).toHaveBeenCalledTimes(1)

    // Logout after the switch removes the listener from the contract it was registered on
    mocks.ethAddress.value = null
    await nextTick()
    await flush()
    expect(newToken.off).toHaveBeenCalledWith(newToken.on.mock.calls[0][0], newToken.on.mock.calls[0][1])
  })
})
