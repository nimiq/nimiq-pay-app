import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createBirpc,
  trackWeb3Request,
  loggerError,
  loggerLog,
  loggerWarn,
  useLocalWallet,
} = vi.hoisted(() => ({
  createBirpc: vi.fn(() => ({
    $close: vi.fn(),
    onChainAdded: { asEvent: vi.fn() },
    onChainChanged: { asEvent: vi.fn() },
    onUnsupportedChain: { asEvent: vi.fn() },
    updateRpcUrl: vi.fn(),
  })),
  trackWeb3Request: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  useLocalWallet: vi.fn(),
}))

vi.mock('@capacitor/toast', () => ({
  Toast: {
    show: vi.fn(),
  },
}))

vi.mock('birpc', () => ({
  createBirpc,
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (message: string) => message,
  },
}))

vi.mock('@/lib/analytics', () => ({
  trackChainSwitched: vi.fn(),
  trackWeb3Request,
}))

vi.mock('@/lib/ethereum/hex-utils', () => ({
  hexToBytes: vi.fn(),
}))

vi.mock('@/lib/ethereum/validation', () => ({
  addressesEqual: vi.fn(),
  isValidEthAddress: vi.fn(),
  parseChainId: vi.fn(),
}))

vi.mock('@/lib/polygon/config', () => ({
  polygonUsdtConfig: {},
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet,
}))

vi.mock('@/stores/nimiq-network', () => ({
  STAKING_CONTRACT_ADDRESS: 'NQ00 TEST',
  useNimiqNetwork: vi.fn(),
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt: vi.fn(),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: vi.fn(),
}))

vi.mock('@/stores/transactions', () => ({
  useTransactions: vi.fn(),
}))

vi.mock('../../web3-provider/src/utils', () => ({
  generateUUID: () => 'test-uuid',
}))

vi.mock('./useLogger', () => ({
  useLogger: () => ({
    error: loggerError,
    log: loggerLog,
    warn: loggerWarn,
  }),
}))

describe('MiniAppHost Ethereum rejection messages', () => { // eslint-disable-line test/prefer-lowercase-title
  const ethAddress = '0x0000000000000000000000000000000000000001'

  function createBrowser() {
    return {
      addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
      clearAllCookies: vi.fn(() => Promise.resolve()),
      postMessage: vi.fn(),
      removeAllListeners: vi.fn(() => Promise.resolve()),
    }
  }

  async function createHost(options: { confirmed?: boolean } = {}) {
    const { MiniAppHost } = await import('./useMiniAppHost')

    const browser = createBrowser()
    const requestUserConfirmation = vi.fn().mockResolvedValue(options.confirmed ?? true)

    const _host = new MiniAppHost(browser as never, {
      requestUserConfirmation,
      title: 'Example',
      url: 'https://app.example',
    })

    const [handlers] = createBirpc.mock.calls.at(-1)!

    return {
      browser,
      handleRequest: handlers.handleRequest as (params: {
        network: string
        name: string
        params?: unknown
        object?: unknown
      }) => Promise<unknown>,
      requestUserConfirmation,
    }
  }

  beforeEach(() => {
    createBirpc.mockClear()
    trackWeb3Request.mockReset()
    loggerError.mockReset()
    loggerLog.mockReset()
    loggerWarn.mockReset()
    useLocalWallet.mockReset()
    useLocalWallet.mockReturnValue({
      getEthAddress: vi.fn(() => ({ data: ethAddress, error: undefined })),
      getEthWallet: vi.fn(),
    })
  })

  it('preserves the rejection message after bridge-safe serialization', async () => {
    const { handleRequest } = await createHost({ confirmed: false })

    await expect(handleRequest({
      network: 'ethereum',
      name: 'requestAccounts',
      object: {},
      params: {},
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: 4001,
      message: 'User rejected the request.',
    })
  })

  it('returns no permissions before eth_accounts access is granted', async () => {
    const { handleRequest } = await createHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_getPermissions',
      object: [],
      params: [],
    })).resolves.toEqual([])
  })

  it('returns a serializable eth_accounts permission after wallet_requestPermissions', async () => {
    const { handleRequest, requestUserConfirmation } = await createHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ eth_accounts: {} }],
      params: [{ eth_accounts: {} }],
    }).then((response: unknown) => JSON.parse(JSON.stringify(response)))).resolves.toEqual([
      {
        caveats: [
          {
            type: 'restrictReturnedAccounts',
            value: [ethAddress],
          },
        ],
        date: expect.any(Number),
        id: expect.any(String),
        invoker: 'https://app.example',
        parentCapability: 'eth_accounts',
      },
    ])

    expect(requestUserConfirmation).toHaveBeenCalledTimes(1)
  })

  it('returns the stored permission without prompting again when already granted', async () => {
    const { handleRequest, requestUserConfirmation } = await createHost()

    const firstResponse = await handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ eth_accounts: {} }],
      params: [{ eth_accounts: {} }],
    })

    const secondResponse = await handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ eth_accounts: {} }],
      params: [{ eth_accounts: {} }],
    })

    expect(secondResponse).toEqual(firstResponse)
    expect(requestUserConfirmation).toHaveBeenCalledTimes(1)
  })

  it('exposes the stored permission through wallet_getPermissions after wallet_requestPermissions', async () => {
    const { handleRequest } = await createHost()

    const permission = await handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ eth_accounts: {} }],
      params: [{ eth_accounts: {} }],
    })

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_getPermissions',
      object: [],
      params: [],
    })).resolves.toEqual(permission)
  })

  it('populates wallet_getPermissions after requestAccounts succeeds', async () => {
    const { handleRequest } = await createHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'requestAccounts',
      object: {},
      params: {},
    })).resolves.toEqual([ethAddress])

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_getPermissions',
      object: [],
      params: [],
    })).resolves.toEqual([
      expect.objectContaining({
        caveats: [
          expect.objectContaining({
            type: 'restrictReturnedAccounts',
            value: [ethAddress],
          }),
        ],
        invoker: 'https://app.example',
        parentCapability: 'eth_accounts',
      }),
    ])
  })

  it('returns the standard rejection error for wallet_requestPermissions cancellations', async () => {
    const { handleRequest } = await createHost({ confirmed: false })

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ eth_accounts: {} }],
      params: [{ eth_accounts: {} }],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: 4001,
      message: 'User rejected the request.',
    })
  })

  it('rejects malformed wallet_requestPermissions params with -32602', async () => {
    const { handleRequest } = await createHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: { eth_accounts: {} },
      params: { eth_accounts: {} },
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32602,
    })
  })

  it('rejects unsupported wallet_requestPermissions capabilities with 4200', async () => {
    const { handleRequest } = await createHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_requestPermissions',
      object: [{ wallet_snap: {} }],
      params: [{ wallet_snap: {} }],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: 4200,
    })
  })
})
