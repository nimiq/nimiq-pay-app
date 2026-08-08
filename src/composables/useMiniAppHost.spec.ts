import { Buffer } from 'node:buffer'
import * as NimiqCore from '@nimiq/core'
import { Interface, parseUnits } from 'ethers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { ZERO_HASH_ROOT } from '@/types/transactions'
import { MiniAppHost } from './useMiniAppHost'

const erc20Interface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
])

const {
  addressesEqual,
  createBirpc,
  hexToBytes,
  isValidEthAddress,
  loggerError,
  loggerLog,
  loggerWarn,
  parseChainId,
  requestUserConfirmation,
  sendTx,
  signTransaction,
  syncTransactionHistory,
  trackWeb3Request,
  updateBalance,
  useLocalWallet,
  useNimiqNetwork,
  usePolygonUsdt,
  useRemoteSigner,
  useTransactions,
} = vi.hoisted(() => ({
  addressesEqual: vi.fn(),
  createBirpc: vi.fn(() => ({
    $close: vi.fn(),
    onChainAdded: { asEvent: vi.fn() },
    onChainChanged: { asEvent: vi.fn() },
    onUnsupportedChain: { asEvent: vi.fn() },
    updateRpcUrl: vi.fn(),
  })),
  hexToBytes: vi.fn(),
  isValidEthAddress: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  parseChainId: vi.fn(),
  requestUserConfirmation: vi.fn(async () => true),
  sendTx: vi.fn(),
  signTransaction: vi.fn(async () => '0xsigned'),
  syncTransactionHistory: vi.fn(async () => {}),
  trackWeb3Request: vi.fn(),
  updateBalance: vi.fn(async () => {}),
  useLocalWallet: vi.fn(),
  useNimiqNetwork: vi.fn(),
  usePolygonUsdt: vi.fn(),
  useRemoteSigner: vi.fn(),
  useTransactions: vi.fn(),
}))

const ethAddress = '0x1111111111111111111111111111111111111111'

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
  hexToBytes,
}))

vi.mock('@/lib/ethereum/validation', () => ({
  addressesEqual,
  isValidEthAddress,
  parseChainId,
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet,
}))

vi.mock('@/stores/nimiq-network', () => ({
  STAKING_CONTRACT_ADDRESS: 'NQ00 TEST',
  useNimiqNetwork,
}))

vi.mock('@/stores/polygon-usdt', () => ({
  usePolygonUsdt,
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner,
}))

vi.mock('@/stores/transactions', () => ({
  useTransactions,
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

function createBrowser() {
  return {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    clearAllCookies: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(() => Promise.resolve()),
  }
}

async function createPermissionHost(options: { confirmed?: boolean } = {}) {
  const browser = createBrowser()
  const confirmationPrompt = vi.fn().mockResolvedValue(options.confirmed ?? true)

  const _host = new MiniAppHost(browser as never, {
    requestUserConfirmation: confirmationPrompt,
    title: 'Example',
    url: 'https://app.example',
  })

  const [handlers] = createBirpc.mock.calls.at(-1)! as any[]

  return {
    browser,
    handleRequest: handlers.handleRequest as (params: {
      network: string
      name: string
      params?: unknown
      object?: unknown
    }) => Promise<unknown>,
    requestUserConfirmation: confirmationPrompt,
  }
}

function jsonRpcResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } satisfies Partial<Response>
}

function createReconnectHost(chainId = '0x89') {
  return MiniAppHost.reconnect(createBrowser() as never, {
    url: 'https://app.uniswap.org',
    title: 'Uniswap',
    evmRpcUrls: {
      [chainId]: 'https://polygon-rpc.test',
    },
    requestUserConfirmation,
  }, chainId)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.stubGlobal('Nimiq', {
    AccountType: { Basic: 0, Staking: 3 },
  })

  addressesEqual.mockImplementation((left?: string, right?: string) =>
    left?.toLowerCase() === right?.toLowerCase())
  hexToBytes.mockImplementation((value: string) =>
    Uint8Array.from(Buffer.from(value.replace(/^0x/, ''), 'hex')))
  isValidEthAddress.mockImplementation((value?: string) =>
    !!value && /^0x[a-fA-F0-9]{40}$/.test(value))
  parseChainId.mockImplementation((value?: string | number) => {
    if (typeof value === 'number') {
      return value
    }
    if (typeof value !== 'string' || value.length === 0) {
      return undefined
    }
    return value.startsWith('0x')
      ? Number.parseInt(value, 16)
      : Number.parseInt(value, 10)
  })
  useLocalWallet.mockReturnValue({
    getEthAddress: vi.fn(() => ({ data: ethAddress, error: undefined })),
    getEthWallet: vi.fn(() => ({
      data: {
        address: ethAddress,
        signTransaction,
      },
      error: undefined,
    })),
  })
  useNimiqNetwork.mockReturnValue({
    consensus: 'established',
    height: 0,
  })
  usePolygonUsdt.mockReturnValue({
    updateBalance,
    syncTransactionHistory,
  })
  useRemoteSigner.mockReturnValue({
    remoteHeight: 0,
    remoteAddress: { toUserFriendlyAddress: () => 'NQ11 REMOTE' },
  })
  sendTx.mockResolvedValue({ outcome: 'submitted', tx: { hash: 'payment-hash' }, serialized: 'serialized-payment' })
  useTransactions.mockReturnValue({ sendTx })
})

describe('MiniAppHost Nimiq send certainty', () => { // eslint-disable-line test/prefer-lowercase-title
  it.each([
    ['sendBasicTransaction', ['NQ22 RECIPIENT', 10], 'nimiq_send_transaction'],
    ['sendNewStakerTransaction', ['NQ33 VALIDATOR', 10], 'nimiq_staking_create_staker'],
  ])('returns -32001 without a hash for uncertain %s', async (name, params, requestType) => {
    sendTx.mockResolvedValue({
      outcome: 'unknown',
      stagedTx: { hash: 'staged-hash' },
      stagedHash: 'staged-hash',
      error: 'response lost',
    })
    const { handleRequest } = await createPermissionHost()

    const response = await handleRequest({
      network: 'nimiq',
      name,
      params,
    }).then(
      value => ({ resolved: value }),
      error => ({ rejected: JSON.parse(JSON.stringify(error)) }),
    )

    expect(response).toEqual({
      rejected: {
        code: -32001,
        type: 'TRANSACTION_OUTCOME_UNKNOWN',
        message: 'The transaction outcome is unknown. It may have been submitted; do not retry.',
      },
    })
    expect(trackWeb3Request).toHaveBeenCalledWith(expect.objectContaining({
      requestType,
      approved: true,
      success: false,
    }))
    expect(loggerLog).toHaveBeenCalledWith(expect.stringContaining('outcome unknown'), expect.objectContaining({ stagedHash: 'staged-hash' }))
  })
})

describe('MiniAppHost Nimiq remote signer guard', () => { // eslint-disable-line test/prefer-lowercase-title
  it.each([
    ['sendBasicTransaction', ['NQ22 RECIPIENT', 10]],
    ['sendNewStakerTransaction', ['NQ33 VALIDATOR', 10]],
    ['sendStakeTransaction', [10]],
  ])('rejects %s before confirmation without an active remote signer', async (name, params) => {
    useRemoteSigner.mockReturnValue({ remoteHeight: 0, remoteAddress: undefined })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name,
      params,
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: -32000,
      message: 'Something went wrong syncing your account',
      type: 'NETWORK_ERROR',
    })
    expect(confirmationPrompt).not.toHaveBeenCalled()
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('still prompts for remove-stake without an active remote signer', async () => {
    useRemoteSigner.mockReturnValue({ remoteHeight: 0, remoteAddress: undefined })
    useLocalWallet.mockReturnValue({ localAddress: { toUserFriendlyAddress: () => 'NQ00 LOCAL' } })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendRemoveStakeTransaction',
      params: [10],
    })).resolves.toBe('payment-hash')
    expect(confirmationPrompt).toHaveBeenCalledTimes(1)
  })
})

describe('MiniAppHost rejection messages', () => { // eslint-disable-line test/prefer-lowercase-title
  it('preserves the Nimiq error type and existing RPC fields through serialization', async () => {
    const { handleRequest } = await createPermissionHost({ confirmed: false })

    await expect(handleRequest({
      network: 'nimiq',
      name: 'listAccounts',
      object: {},
      params: {},
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: 4001,
      type: 'PERMISSION_DENIED',
      message: 'User rejected the request.',
    })
  })

  it('preserves the rejection message after bridge-safe serialization', async () => {
    const { handleRequest } = await createPermissionHost({ confirmed: false })

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
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'ethereum',
      name: 'wallet_getPermissions',
      object: [],
      params: [],
    })).resolves.toEqual([])
  })

  it('returns a serializable eth_accounts permission after wallet_requestPermissions', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

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

    expect(confirmationPrompt).toHaveBeenCalledTimes(1)
  })

  it('returns the stored permission without prompting again when already granted', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

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
    expect(confirmationPrompt).toHaveBeenCalledTimes(1)
  })

  it('exposes the stored permission through wallet_getPermissions after wallet_requestPermissions', async () => {
    const { handleRequest } = await createPermissionHost()

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
    const { handleRequest } = await createPermissionHost()

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
    const { handleRequest } = await createPermissionHost({ confirmed: false })

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
    const { handleRequest } = await createPermissionHost()

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
    const { handleRequest } = await createPermissionHost()

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

describe('miniAppHost', () => {
  it('refreshes Polygon USDT history after broadcasting a Polygon dApp transaction', async () => {
    const rpcFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string }

      switch (payload.method) {
        case 'eth_getTransactionCount':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: '0x7' })
        case 'eth_sendRawTransaction':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 2, result: '0xabc123' })
        case 'eth_getTransactionReceipt':
          return jsonRpcResponse({
            jsonrpc: '2.0',
            id: 3,
            result: {
              status: '0x1',
              blockNumber: '0x10',
            },
          })
        default:
          throw new Error(`Unexpected RPC method: ${payload.method}`)
      }
    })
    vi.stubGlobal('fetch', rpcFetch)

    const host = createReconnectHost()

    const txHash = await (host as any).signEthTransaction({
      to: '0x2222222222222222222222222222222222222222',
      from: ethAddress,
      gas: '0x5208',
      gasPrice: '0x3b9aca00',
      value: '0x0',
      data: '0x',
      nonce: '0x7',
      chainId: '0x89',
    })

    expect(txHash).toBe('0xabc123')
    expect(trackWeb3Request).toHaveBeenCalled()

    await vi.waitFor(() => {
      expect(updateBalance).toHaveBeenCalledOnce()
      expect(syncTransactionHistory).toHaveBeenCalledOnce()
    })
  })

  it('shows decoded Polygon USDT transfer details in the confirmation request', async () => {
    const rpcFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string }

      switch (payload.method) {
        case 'eth_getTransactionCount':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: '0x7' })
        case 'eth_sendRawTransaction':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 2, result: '0xabc123' })
        case 'eth_getTransactionReceipt':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 3, result: null })
        default:
          throw new Error(`Unexpected RPC method: ${payload.method}`)
      }
    })
    vi.stubGlobal('fetch', rpcFetch)

    const host = createReconnectHost()

    await (host as any).signEthTransaction({
      to: polygonUsdtConfig.tokenContract,
      from: ethAddress,
      gas: '0x11170',
      gasPrice: '0x3b9aca00',
      value: '0x0',
      data: erc20Interface.encodeFunctionData('transfer', [
        '0x2222222222222222222222222222222222222222',
        parseUnits('123.45', 6),
      ]),
      nonce: '0x7',
      chainId: '0x89',
    })

    expect(requestUserConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'eth-transaction',
      data: expect.objectContaining({
        decodedAssetTransfer: expect.objectContaining({
          assetSymbol: 'USDT',
          network: 'Polygon',
          recipient: '0x2222222222222222222222222222222222222222',
          amount: '123.45 USDT',
        }),
      }),
    }))
  })

  it('rejects decoded Polygon USDT transfers that include a native token value', async () => {
    const rpcFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string }

      switch (payload.method) {
        case 'eth_getTransactionCount':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: '0x7' })
        default:
          throw new Error(`Unexpected RPC method: ${payload.method}`)
      }
    })
    vi.stubGlobal('fetch', rpcFetch)

    const host = createReconnectHost()

    await expect((host as any).signEthTransaction({
      to: polygonUsdtConfig.tokenContract,
      from: ethAddress,
      gas: '0x11170',
      gasPrice: '0x3b9aca00',
      value: '0x1',
      data: erc20Interface.encodeFunctionData('transfer', [
        '0x2222222222222222222222222222222222222222',
        parseUnits('1', 6),
      ]),
      nonce: '0x7',
      chainId: '0x89',
    })).rejects.toThrow('Polygon USDT transfers must not include a native token value')

    expect(requestUserConfirmation).not.toHaveBeenCalled()
  })

  it('allows generic ERC-20 transfers without attaching Polygon USDT metadata', async () => {
    const rpcFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { method: string }

      switch (payload.method) {
        case 'eth_getTransactionCount':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: '0x7' })
        case 'eth_sendRawTransaction':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 2, result: '0xabc123' })
        case 'eth_getTransactionReceipt':
          return jsonRpcResponse({ jsonrpc: '2.0', id: 3, result: null })
        default:
          throw new Error(`Unexpected RPC method: ${payload.method}`)
      }
    })
    vi.stubGlobal('fetch', rpcFetch)

    const host = createReconnectHost()

    await (host as any).signEthTransaction({
      to: '0x9999999999999999999999999999999999999999',
      from: ethAddress,
      gas: '0x11170',
      gasPrice: '0x3b9aca00',
      value: '0x0',
      data: erc20Interface.encodeFunctionData('transfer', [
        '0x2222222222222222222222222222222222222222',
        parseUnits('1', 6),
      ]),
      nonce: '0x7',
      chainId: '0x89',
    })

    expect(requestUserConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'eth-transaction',
      data: expect.not.objectContaining({
        decodedAssetTransfer: expect.anything(),
      }),
    }))
  })
})

describe('miniAppHost HTLC guards', () => {
  const localKeyPair = NimiqCore.KeyPair.generate()
  const cosignerKeyPair = NimiqCore.KeyPair.generate()
  const ownContract = NimiqCore.KeyPair.generate().toAddress().toUserFriendlyAddress()
  const foreignContract = NimiqCore.KeyPair.generate().toAddress().toUserFriendlyAddress()
  const recipient = NimiqCore.KeyPair.generate().toAddress().toUserFriendlyAddress()
  const signatureProofHex = NimiqCore.BufferUtils.toHex(NimiqCore.SignatureProof.singleSig(
    localKeyPair.publicKey,
    NimiqCore.Signature.create(localKeyPair.privateKey, localKeyPair.publicKey, new Uint8Array([1])),
  ).serialize())

  /** The contract shape `createDepositData` produces for our own custody HTLCs. */
  const ownHtlcAccount = {
    type: 'htlc',
    balance: 1000,
    sender: localKeyPair.toAddress().toUserFriendlyAddress(),
    recipient: cosignerKeyPair.toAddress().toUserFriendlyAddress(),
    hashRoot: ZERO_HASH_ROOT,
    hashCount: 1,
    timeout: 0,
  }
  const foreignHtlcAccount = { ...ownHtlcAccount, recipient, hashRoot: 'aa'.repeat(32) }

  let isOurRemoteSigner: ReturnType<typeof vi.fn>
  let getAccount: ReturnType<typeof vi.fn>
  let getHtlcCreationData: ReturnType<typeof vi.fn>
  let sendTx: ReturnType<typeof vi.fn>

  /** Params for each redeem method; all of them take the contract address first. */
  const redeemCalls = [
    ['sendRedeemRegularHtlcTransaction', (contract: string) => [contract, recipient, 'ab'.repeat(32), 'cd'.repeat(32), 1, 'blake2b', 100]],
    ['sendRedeemTimeoutHtlcTransaction', (contract: string) => [contract, recipient, 100]],
    ['sendRedeemEarlyHtlcTransaction', (contract: string) => [contract, recipient, signatureProofHex, signatureProofHex, 100, 0, 42]],
    ['signRedeemEarlyHtlcTransaction', (contract: string) => [contract, recipient, 100, 0, 42]],
  ] as const

  beforeEach(() => {
    vi.stubGlobal('Nimiq', NimiqCore)
    isOurRemoteSigner = vi.fn(async () => false)
    getAccount = vi.fn(async () => ({ data: foreignHtlcAccount, error: undefined }))
    getHtlcCreationData = vi.fn(async () => undefined)
    sendTx = vi.fn(async () => ({ outcome: 'submitted', tx: { hash: 'tx-hash' }, serialized: 'serialized-tx' }))

    useLocalWallet.mockReturnValue({
      localAddress: localKeyPair.toAddress(),
      localWallet: localKeyPair,
    })
    useNimiqNetwork.mockReturnValue({
      consensus: 'established',
      height: 0,
      networkId: 5,
      getAccount,
      getHtlcCreationData,
    })
    useRemoteSigner.mockReturnValue({
      remoteHeight: 0,
      remoteAddress: cosignerKeyPair.toAddress(),
      remotePublicKey: NimiqCore.BufferUtils.toHex(cosignerKeyPair.publicKey.serialize()),
      isOurRemoteSigner,
    })
    useTransactions.mockReturnValue({ sendTx })
  })

  it.each(redeemCalls)('refuses %s against a contract listed as our own remote signer', async (name, params) => {
    const { handleRequest } = await createPermissionHost()
    isOurRemoteSigner.mockImplementation(async (address: string) => address === ownContract)

    await expect(handleRequest({ network: 'nimiq', name, params: params(ownContract) })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: 4001,
      // Text unique to the ownership refusal — the unverifiable path must not satisfy this.
      message: expect.stringContaining('Refusing to spend'),
    })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it.each(redeemCalls)('refuses %s against a contract whose on-chain shape is ours but which the table has not learnt yet', async (name, params) => {
    const { handleRequest } = await createPermissionHost()
    getAccount.mockResolvedValue({ data: ownHtlcAccount, error: undefined })

    await expect(handleRequest({ network: 'nimiq', name, params: params(ownContract) })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: 4001 })
    expect(isOurRemoteSigner).toHaveBeenCalledWith(ownContract)
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('refuses a redeem whose account lookup fails, as a network error rather than a rejection', async () => {
    const { handleRequest } = await createPermissionHost()
    getAccount.mockResolvedValue({ data: undefined, error: 'No account found' })

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32000,
      message: expect.stringContaining('Cannot verify the owner'),
    })
    expect(sendTx).not.toHaveBeenCalled()
  })

  // A key we cannot parse is exactly as unverifiable as a key we do not have, and must reach the
  // Mini App as such — not as -32603, which reads like the host crashed.
  it('refuses a redeem whose cosigner key is not valid hex, as a network error rather than a host crash', async () => {
    const { handleRequest } = await createPermissionHost()
    useRemoteSigner.mockReturnValue({
      remoteHeight: 0,
      remoteAddress: cosignerKeyPair.toAddress(),
      remotePublicKey: 'zz'.repeat(32),
      isOurRemoteSigner,
    })

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32000,
      message: expect.stringContaining('Cannot verify the owner'),
    })
    expect(getAccount).not.toHaveBeenCalled()
    expect(sendTx).not.toHaveBeenCalled()
  })

  // A light client whose history is not ready answers with an empty result rather than throwing,
  // so an unreadable shape must not be mistaken for a foreign one.
  it('refuses a redeem whose contract shape resolves empty instead of treating it as foreign', async () => {
    const { handleRequest } = await createPermissionHost()
    getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
    getHtlcCreationData.mockResolvedValue(undefined)

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32000,
      message: expect.stringContaining('Cannot verify the owner'),
    })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('refuses a redeem whose creation-transaction query times out', async () => {
    const { handleRequest } = await createPermissionHost()
    getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
    getHtlcCreationData.mockRejectedValue(new Error('Operation timed out after 30000 milliseconds'))

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: -32000 })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('reads a pruned contract from its creation transaction rather than trusting the account lookup', async () => {
    const { handleRequest } = await createPermissionHost()
    getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
    getHtlcCreationData.mockResolvedValue(ownHtlcAccount)

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [ownContract, recipient, 100] })
      .catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: 4001 })
  })

  it('still lets a Mini App redeem its own HTLC', async () => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })).resolves.toBe('tx-hash')
    expect(sendTx).toHaveBeenCalledWith(expect.objectContaining({ sender: foreignContract, recipient }))
  })

  it('shows the source contract on the redeem confirmation sheet', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await handleRequest({ network: 'nimiq', name: 'sendRedeemTimeoutHtlcTransaction', params: [foreignContract, recipient, 100] })

    expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({
      htlcContractAddress: foreignContract,
      htlcData: { type: 'redeem-timeout' },
    }))
  })

  it('shows the source contract and validity start height when only signing an early redeem', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await handleRequest({ network: 'nimiq', name: 'signRedeemEarlyHtlcTransaction', params: [foreignContract, recipient, 100, 0, 42] })

    expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({
      htlcContractAddress: foreignContract,
      htlcValidityStartHeight: 42,
    }))
  })

  it.each([
    ['a blake2b root one byte short', 'ab'.repeat(31), 'blake2b', 1],
    ['a sha256 root one byte long', 'ab'.repeat(33), 'sha256', 1],
    ['a 32-byte root declared as sha512', 'ab'.repeat(32), 'sha512', 1],
    ['a hash count of 0', 'ab'.repeat(32), 'blake2b', 0],
    ['a hash count of 256', 'ab'.repeat(32), 'blake2b', 256],
  ])('rejects a new HTLC with %s', async (_label, hashRoot, hashAlgorithm, hashCount) => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendNewHtlcTransaction',
      params: [localKeyPair.toAddress().toUserFriendlyAddress(), recipient, hashRoot, hashCount, hashAlgorithm, 1234567890, 100],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: -32602 })
    expect(sendTx).not.toHaveBeenCalled()
  })

  // An inherited Object member must fail as an unknown algorithm, not as a root-length problem
  // reported against an undefined expected length.
  it.each(['constructor', 'toString'])('rejects a new HTLC declaring %s as its hash algorithm', async (hashAlgorithm) => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendNewHtlcTransaction',
      params: [localKeyPair.toAddress().toUserFriendlyAddress(), recipient, 'ab'.repeat(32), 1, hashAlgorithm, 1234567890, 100],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32602,
      message: 'Invalid hash algorithm',
    })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('rejects a regular redeem whose hash root does not match the declared algorithm', async () => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendRedeemRegularHtlcTransaction',
      params: [foreignContract, recipient, 'ab'.repeat(32), 'cd'.repeat(31), 1, 'blake2b', 100],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: -32602 })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it.each([
    ['a pre-image one byte short', 'ab'.repeat(31), 'cd'.repeat(32), 'blake2b'],
    ['a pre-image of 256 bytes, which the length prefix cannot describe', 'ab'.repeat(256), 'cd'.repeat(32), 'blake2b'],
    ['a 32-byte pre-image declared as sha512', 'ab'.repeat(32), 'cd'.repeat(64), 'sha512'],
  ])('rejects a regular redeem with %s', async (_label, preImage, hashRoot, hashAlgorithm) => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendRedeemRegularHtlcTransaction',
      params: [foreignContract, recipient, preImage, hashRoot, 1, hashAlgorithm, 100],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: -32602 })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('rejects a regular redeem with a mismatched pre-image passed in object form', async () => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendRedeemRegularHtlcTransaction',
      params: {
        contractAddress: foreignContract,
        recipient,
        preImage: 'ab'.repeat(31),
        hashRoot: 'cd'.repeat(32),
        hashCount: 1,
        hashAlgorithm: 'blake2b',
        value: 100,
      },
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({ code: -32602 })
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('accepts a regular redeem whose pre-image matches the algorithm root length', async () => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendRedeemRegularHtlcTransaction',
      params: [foreignContract, recipient, 'ab'.repeat(64), 'cd'.repeat(64), 1, 'sha512', 100],
    })).resolves.toBe('tx-hash')
  })

  it('accepts a 64-byte sha512 root and the maximum hash count', async () => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendNewHtlcTransaction',
      params: [localKeyPair.toAddress().toUserFriendlyAddress(), recipient, 'ab'.repeat(64), 255, 'sha512', 1234567890, 100],
    })).resolves.toBe('tx-hash')
  })
})
