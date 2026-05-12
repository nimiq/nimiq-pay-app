import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MiniAppHost } from './useMiniAppHost'

const {
  createBirpc,
  grantDeviceIdConsent,
  hasDeviceIdConsent,
  loggerError,
  loggerLog,
  loggerWarn,
  trackWeb3Request,
} = vi.hoisted(() => ({
  createBirpc: vi.fn(() => ({
    $close: vi.fn(),
    onChainAdded: { asEvent: vi.fn() },
    onChainChanged: { asEvent: vi.fn() },
    onUnsupportedChain: { asEvent: vi.fn() },
    updateRpcUrl: vi.fn(),
  })),
  grantDeviceIdConsent: vi.fn(),
  hasDeviceIdConsent: vi.fn(() => false),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  trackWeb3Request: vi.fn(),
}))

vi.mock('@capacitor/toast', () => ({ Toast: { show: vi.fn() } }))
vi.mock('birpc', () => ({ createBirpc }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (m: string) => m } }))
vi.mock('@/lib/analytics', () => ({ trackChainSwitched: vi.fn(), trackWeb3Request }))
vi.mock('@/lib/ethereum/hex-utils', () => ({ hexToBytes: vi.fn() }))
vi.mock('@/lib/ethereum/validation', () => ({
  addressesEqual: vi.fn(),
  isValidEthAddress: vi.fn(),
  parseChainId: vi.fn(),
}))
vi.mock('@/stores/local-wallet', () => ({ useLocalWallet: vi.fn() }))
vi.mock('@/stores/nimiq-network', () => ({ STAKING_CONTRACT_ADDRESS: 'NQ00', useNimiqNetwork: vi.fn() }))
vi.mock('@/stores/polygon-usdt', () => ({ usePolygonUsdt: vi.fn() }))
vi.mock('@/stores/remote-signer', () => ({ useRemoteSigner: vi.fn() }))
vi.mock('@/stores/transactions', () => ({ useTransactions: vi.fn() }))
vi.mock('../../web3-provider/src/utils', () => ({ generateUUID: () => 'test-uuid' }))
vi.mock('./useLogger', () => ({ useLogger: () => ({ error: loggerError, log: loggerLog, warn: loggerWarn }) }))

vi.mock('@/stores/mini-apps', () => ({
  useMiniApps: () => ({
    hasDeviceIdConsent,
    grantDeviceIdConsent,
  }),
}))

vi.mock('@capacitor/device', () => ({
  Device: { getId: vi.fn(async () => ({ identifier: 'dev-stable-id' })) },
}))

function createBrowser() {
  return {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    clearAllCookies: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(() => Promise.resolve()),
  }
}

function createHost(opts: { url?: string, title?: string, confirm?: ReturnType<typeof vi.fn> } = {}) {
  const browser = createBrowser()
  const confirmationPrompt = opts.confirm ?? vi.fn().mockResolvedValue(true)
  const _host = new MiniAppHost(browser as never, {
    requestUserConfirmation: confirmationPrompt,
    title: opts.title ?? 'Example',
    url: opts.url ?? 'https://app.example/',
  })
  const [handlers] = createBirpc.mock.calls.at(-1)! as any[]
  return {
    confirm: confirmationPrompt,
    handleRequest: handlers.handleRequest as (params: { network: string, name: string, params?: unknown }) => Promise<unknown>,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hasDeviceIdConsent.mockReturnValue(false)
})

describe('requestDeviceIdentifier RPC', () => {
  it('prompts on first call and returns a 64-hex digest', async () => {
    const { handleRequest, confirm } = createHost()
    const id = await handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'leaderboard' } })
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      type: 'deviceIdentifier',
      reason: 'leaderboard',
      url: 'https://app.example/',
    }))
    expect(grantDeviceIdConsent).toHaveBeenCalledWith('https://app.example')
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({
      requestType: 'request_device_identifier',
      approved: true,
      success: true,
    }))
  })

  it('auto-resolves without prompting when consent already granted', async () => {
    hasDeviceIdConsent.mockReturnValue(true)
    const { handleRequest, confirm } = createHost()
    const id = await handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'x' } })
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(confirm).not.toHaveBeenCalled()
    expect(grantDeviceIdConsent).not.toHaveBeenCalled()
  })

  it('returns the same id across calls (deterministic per origin)', async () => {
    hasDeviceIdConsent.mockReturnValue(true)
    const { handleRequest } = createHost()
    const first = await handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'a' } })
    const second = await handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'b' } })
    expect(first).toBe(second)
  })

  it('produces different ids across origins', async () => {
    hasDeviceIdConsent.mockReturnValue(true)
    const a = createHost({ url: 'https://a.test/' })
    const b = createHost({ url: 'https://b.test/' })
    const idA = await a.handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'x' } })
    const idB = await b.handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'x' } })
    expect(idA).not.toBe(idB)
  })

  it('rejects with PermissionDenied when user denies', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    const { handleRequest } = createHost({ confirm })
    await expect(handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: 'leaderboard' } }))
      .rejects
      .toThrow()
    expect(grantDeviceIdConsent).not.toHaveBeenCalled()
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({
      requestType: 'request_device_identifier',
      approved: false,
      success: false,
    }))
  })

  it('throws when reason is missing or empty', async () => {
    const { handleRequest, confirm } = createHost()
    await expect(handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: {} })).rejects.toThrow()
    await expect(handleRequest({ network: 'host', name: 'requestDeviceIdentifier', params: { reason: '   ' } })).rejects.toThrow()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('throws on unknown host message names', async () => {
    const { handleRequest } = createHost()
    await expect(handleRequest({ network: 'host', name: 'somethingElse', params: {} })).rejects.toThrow()
  })
})
