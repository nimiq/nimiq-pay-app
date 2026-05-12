import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { Asset } from '@/lib/assets'

const state = vi.hoisted(() => ({
  activeAsset: undefined as any,
  isActive: undefined as any,
  isFeePollActive: undefined as any,
  pollCallback: undefined as undefined | (() => Promise<void>),
  feePollCallback: undefined as undefined | (() => Promise<void>),
  init: vi.fn(async () => {}),
  pause: vi.fn(),
  resume: vi.fn(),
  pauseFeePoll: vi.fn(),
  resumeFeePoll: vi.fn(),
  primeTransferFee: vi.fn(async () => {}),
  primeHtlcFee: vi.fn(async () => {}),
  updateBalance: vi.fn(async () => {}),
  syncTransactionHistory: vi.fn(async () => {}),
  updateSingleTransaction: vi.fn(async () => {}),
  query: vi.fn(async () => []),
  isTestnet: false,
}))

let pollCallCount = 0
vi.mock('@vueuse/core', () => ({
  useTimeoutPoll: (callback: () => Promise<void>) => {
    pollCallCount++
    if (pollCallCount % 2 === 1) {
      // First call: main sync poll
      state.pollCallback = callback
      return {
        pause: state.pause,
        resume: state.resume,
        isActive: state.isActive,
      }
    }
    // Second call: fee poll
    state.feePollCallback = callback
    return {
      pause: state.pauseFeePoll,
      resume: state.resumeFeePoll,
      isActive: state.isFeePollActive,
    }
  },
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({
    log: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/stores/app', () => ({
  useApp: () => ({
    activeAsset: state.activeAsset,
  }),
}))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({
    query: state.query,
  }),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: () => ({
    init: state.init,
    primeTransferFee: state.primeTransferFee,
    primeHtlcFee: state.primeHtlcFee,
    updateBalance: state.updateBalance,
    syncTransactionHistory: state.syncTransactionHistory,
    updateSingleTransaction: state.updateSingleTransaction,
  }),
}))

vi.mock('@/lib', () => ({
  isDev: false,
  get isTestnet() {
    return state.isTestnet
  },
}))

describe('usePolygonSync', () => {
  beforeEach(() => {
    vi.resetModules()
    pollCallCount = 0
    state.activeAsset = ref(Asset.NIM)
    state.isActive = ref(false)
    state.isFeePollActive = ref(false)
    state.pollCallback = undefined
    state.feePollCallback = undefined
    state.init.mockReset()
    state.init.mockResolvedValue(undefined)
    state.pause.mockReset()
    state.resume.mockReset()
    state.pauseFeePoll.mockReset()
    state.resumeFeePoll.mockReset()
    state.primeTransferFee.mockClear()
    state.primeHtlcFee.mockClear()
    state.updateBalance.mockClear()
    state.syncTransactionHistory.mockClear()
    state.updateSingleTransaction.mockClear()
    state.query.mockClear()
    state.isTestnet = false
  })

  it('does not start Polygon polling when NIM is selected', async () => {
    const { usePolygonSync } = await import('./usePolygonSync')

    await usePolygonSync().init()

    expect(state.pause).not.toHaveBeenCalled()
    expect(state.resume).not.toHaveBeenCalled()
    expect(state.pollCallback).toBeTypeOf('function')
  })

  it('pauses Polygon polling when switching away from USDT', async () => {
    state.activeAsset = ref(Asset.USDT)

    const { usePolygonSync } = await import('./usePolygonSync')
    await usePolygonSync().init()

    state.pause.mockClear()
    state.resume.mockClear()
    state.pauseFeePoll.mockClear()
    state.resumeFeePoll.mockClear()
    state.isActive.value = true
    state.isFeePollActive.value = true
    state.activeAsset.value = Asset.NIM
    await nextTick()

    expect(state.pause).toHaveBeenCalledTimes(1)
    expect(state.pauseFeePoll).toHaveBeenCalledTimes(1)
  })

  it('retries initialization after a failed init attempt', async () => {
    state.init.mockRejectedValueOnce(new Error('boom'))

    const { usePolygonSync } = await import('./usePolygonSync')
    const polygonSync = usePolygonSync()

    await polygonSync.init()
    await polygonSync.init()

    expect(state.init).toHaveBeenCalledTimes(2)
  })

  it('warms the Polygon transfer fee snapshot during the fee poll', async () => {
    state.activeAsset = ref(Asset.USDT)

    const { usePolygonSync } = await import('./usePolygonSync')
    await usePolygonSync().init()

    await state.feePollCallback?.()

    expect(state.primeTransferFee).toHaveBeenCalledTimes(1)
  })

  it('does not initialize or manually sync Polygon while on testnet', async () => {
    state.activeAsset = ref(Asset.USDT)
    state.isTestnet = true

    const { usePolygonSync } = await import('./usePolygonSync')
    const polygonSync = usePolygonSync()

    await polygonSync.init()
    await polygonSync.triggerNow()

    expect(state.init).not.toHaveBeenCalled()
    expect(state.resume).not.toHaveBeenCalled()
    expect(state.resumeFeePoll).not.toHaveBeenCalled()
    expect(state.updateBalance).not.toHaveBeenCalled()
    expect(state.syncTransactionHistory).not.toHaveBeenCalled()
    expect(state.updateSingleTransaction).not.toHaveBeenCalled()
    expect(state.query).not.toHaveBeenCalled()
  })
})
