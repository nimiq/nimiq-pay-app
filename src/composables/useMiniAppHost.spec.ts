import { Buffer } from 'node:buffer'
import { Toast } from '@capacitor/toast'
import { Interface, parseUnits } from 'ethers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { Asset } from '@/lib/assets'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { getActiveMiniAppSession, MiniAppHost } from './useMiniAppHost'

const erc20Interface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
])

const {
  addressesEqual,
  createBirpc,
  getBalance,
  getLightningQuote,
  getLimits,
  getPaymentRequestData,
  hexToBytes,
  isValidEthAddress,
  loggerError,
  loggerLog,
  loggerWarn,
  parseChainId,
  parseBitcoinLightningInvoice,
  primeHtlcFee,
  query,
  requestUserConfirmation,
  selectLightningAsset,
  sendTx,
  sendSwapPayment,
  run,
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
    clearAccountCache: vi.fn(),
    fullscreenChanged: { asEvent: vi.fn() },
    onChainAdded: { asEvent: vi.fn() },
    onChainChanged: { asEvent: vi.fn() },
    onUnsupportedChain: { asEvent: vi.fn() },
    updateRpcUrl: vi.fn(),
  })),
  getBalance: vi.fn(),
  getLightningQuote: vi.fn(),
  getLimits: vi.fn(),
  getPaymentRequestData: vi.fn(),
  hexToBytes: vi.fn(),
  isValidEthAddress: vi.fn(),
  loggerError: vi.fn(),
  loggerLog: vi.fn(),
  loggerWarn: vi.fn(),
  parseChainId: vi.fn(),
  parseBitcoinLightningInvoice: vi.fn(),
  primeHtlcFee: vi.fn(),
  query: vi.fn(),
  requestUserConfirmation: vi.fn(async () => true),
  selectLightningAsset: vi.fn(async (): Promise<Asset | undefined> => Asset.NIM),
  sendTx: vi.fn(),
  sendSwapPayment: vi.fn(),
  run: vi.fn(),
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

const featureFlags = vi.hoisted(() => ({ isUsdtMaintenanceActive: false, usdtMaintenanceNotice: 'USDT maintenance notice' }))
vi.mock('@/stores/feature-flags', () => ({ useFeatureFlags: () => featureFlags }))

vi.mock('@/stores/conn', () => ({
  useConn: () => ({ query, run }),
}))

vi.mock('./useBitcoinLightning', () => ({ parseBitcoinLightningInvoice }))
vi.mock('./useStringParser', () => ({ useStringParser: () => ({ getPaymentRequestData }) }))
vi.mock('./useFastspotv1', () => ({ useFastspotApiV1: async () => ({ getLimits, SwapAsset: { NIM: 'NIM', USDT_MATIC: 'USDT_MATIC' } }) }))
vi.mock('./useFastspotV2', () => ({ useFastspotApiV2: async () => ({ getSwap: getLightningQuote }) }))

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
  const removeListener = vi.fn()
  return {
    addListener: vi.fn((_event: string, _handler: (event: { enabled: boolean }) => void) => Promise.resolve({ remove: removeListener })),
    clearAllCookies: vi.fn(() => Promise.resolve()),
    getFullscreen: vi.fn(() => Promise.resolve({ enabled: false })),
    postMessage: vi.fn(),
    removeAllListeners: vi.fn(() => Promise.resolve()),
    removeListener,
    setFullscreen: vi.fn(() => Promise.resolve()),
  }
}

async function createPermissionHost(options: { confirmed?: boolean, evmRpcUrls?: Record<string, string> } = {}) {
  const browser = createBrowser()
  const confirmationPrompt = vi.fn().mockResolvedValue(options.confirmed ?? true)

  const _host = new MiniAppHost(browser as never, {
    evmRpcUrls: options.evmRpcUrls,
    requestUserConfirmation: confirmationPrompt,
    selectLightningAsset,
    title: 'Example',
    url: 'https://app.example',
  })

  const [handlers] = createBirpc.mock.calls.at(-1)! as any[]

  return {
    browser,
    host: _host,
    handlers,
    handleRequest: handlers.handleRequest as (params: {
      network: string
      name: string
      params?: unknown
      object?: unknown
    }) => Promise<unknown>,
    requestUserConfirmation: confirmationPrompt,
  }
}

describe('remote address watcher', () => {
  it('clears the Nimiq account cache only when the address string changes', async () => {
    const signer = reactive<{ remoteAddress?: { toUserFriendlyAddress: () => string } }>({
      remoteAddress: { toUserFriendlyAddress: () => 'NQ11 REMOTE' },
    })
    useRemoteSigner.mockReturnValue(signer)
    const { host } = await createPermissionHost()
    const bridge = createBirpc.mock.results.at(-1)!.value

    signer.remoteAddress = { toUserFriendlyAddress: () => 'NQ11 REMOTE' }
    await nextTick()
    expect(bridge.clearAccountCache).not.toHaveBeenCalled()

    signer.remoteAddress = { toUserFriendlyAddress: () => 'NQ22 REMOTE' }
    await nextTick()
    expect(bridge.clearAccountCache).toHaveBeenCalledOnce()
    expect(bridge.clearAccountCache).toHaveBeenCalledWith('nimiq')

    signer.remoteAddress = undefined
    await nextTick()
    expect(bridge.clearAccountCache).toHaveBeenCalledTimes(2)

    await host.destroy()
  })
})

describe('fullscreen host API', () => {
  it('changes and reads native fullscreen without a host confirmation', async () => {
    const { browser, handleRequest, requestUserConfirmation } = await createPermissionHost()
    browser.getFullscreen.mockResolvedValue({ enabled: true })

    await handleRequest({ network: 'host', name: 'setFullscreen', params: { enabled: true } })
    expect(browser.setFullscreen).toHaveBeenCalledWith({ enabled: true })
    expect(await handleRequest({ network: 'host', name: 'getFullscreen' })).toBe(true)
    await handleRequest({ network: 'host', name: 'setFullscreen', params: { enabled: false } })
    expect(browser.setFullscreen).toHaveBeenLastCalledWith({ enabled: false })
    expect(requestUserConfirmation).not.toHaveBeenCalled()
  })

  it('returns fullscreen failures without showing host toasts', async () => {
    const { browser, handleRequest } = await createPermissionHost()
    await expect(handleRequest({ network: 'host', name: 'setFullscreen', params: { enabled: 'true' } })).rejects.toThrow()
    expect(browser.setFullscreen).not.toHaveBeenCalled()

    browser.setFullscreen.mockRejectedValueOnce(new Error('WebView is hidden'))
    await expect(handleRequest({ network: 'host', name: 'setFullscreen', params: { enabled: true } })).rejects.toThrow('WebView is hidden')
    browser.getFullscreen.mockRejectedValueOnce(new Error('WebView is hidden'))
    await expect(handleRequest({ network: 'host', name: 'getFullscreen' })).rejects.toThrow('WebView is hidden')
    expect(Toast.show).not.toHaveBeenCalled()
  })

  it('forwards native exit and removes its listener on teardown', async () => {
    const { browser, host } = await createPermissionHost()
    await Promise.resolve()
    const listener = browser.addListener.mock.calls.find(([event]) => event === 'fullscreenChange')?.[1]
    expect(listener).toBeDefined()
    listener!({ enabled: false })
    const bridge = createBirpc.mock.results.at(-1)!.value
    expect(bridge.fullscreenChanged.asEvent).toHaveBeenCalledWith(false)

    await host.destroy()
    // fullscreenChange + urlChangeEvent + browserPageLoaded
    expect(browser.removeListener).toHaveBeenCalledTimes(3)
  })

  it('closes the bridge and removes listeners when cookie cleanup fails', async () => {
    const { browser, host } = await createPermissionHost()
    await Promise.resolve()
    browser.clearAllCookies.mockRejectedValueOnce(new Error('Cookie cleanup failed'))
    const bridge = createBirpc.mock.results.at(-1)!.value

    await host.destroy()

    // fullscreenChange + urlChangeEvent + browserPageLoaded
    expect(browser.removeListener).toHaveBeenCalledTimes(3)
    expect(bridge.$close).toHaveBeenCalledOnce()
    expect(loggerError).toHaveBeenCalledWith('Could not clean up Mini App host', expect.any(Error))
  })
})

describe('bridge origin', () => {
  async function bridgeTransport(host: { browser: ReturnType<typeof createBrowser> }) {
    await Promise.resolve()
    const [, transport] = createBirpc.mock.calls.at(-1)! as any[]
    const receive = vi.fn()
    transport.on(receive)
    const emit = (event: string, payload: unknown) =>
      (host.browser.addListener.mock.calls.find(([name]) => name === event)![1] as (event: unknown) => void)(payload)
    return { emit, post: transport.post as (data: unknown) => void, receive }
  }

  it('ignores and withholds bridge messages while the webview is on another origin', async () => {
    const { browser } = await createPermissionHost()
    const { emit, post, receive } = await bridgeTransport({ browser })

    emit('urlChangeEvent', { id: 'm', url: 'https://app.example/' })
    emit('messageFromWebview', { id: 'm', detail: 'from-app' })
    expect(receive).toHaveBeenCalledExactlyOnceWith('from-app')

    emit('urlChangeEvent', { id: 'm', url: 'https://evil.example/' })
    emit('browserPageLoaded', { id: 'm' })
    emit('messageFromWebview', { id: 'm', detail: 'from-evil' })
    post('response')
    expect(receive).toHaveBeenCalledOnce()
    expect(browser.postMessage).not.toHaveBeenCalled()

    // A navigation back to the Mini App only reopens the bridge once it has loaded.
    emit('urlChangeEvent', { id: 'm', url: 'https://APP.example/after-login?x=1' })
    emit('messageFromWebview', { id: 'm', detail: 'from-evil' })
    expect(receive).toHaveBeenCalledOnce()
    emit('browserPageLoaded', { id: 'm' })
    emit('messageFromWebview', { id: 'm', detail: 'from-app-again' })
    post('response')
    expect(receive).toHaveBeenLastCalledWith('from-app-again')
    expect(browser.postMessage).toHaveBeenCalledExactlyOnceWith({ detail: 'response', id: 'm' })
  })

  it('never accepts popup webviews, even when the main webview is on the Mini App origin', async () => {
    const { browser } = await createPermissionHost()
    const { emit, receive } = await bridgeTransport({ browser })

    emit('urlChangeEvent', { id: 'p', url: 'https://evil.example/' })
    emit('browserPageLoaded', { id: 'p' })
    emit('urlChangeEvent', { id: 'm', url: 'https://app.example/' })
    emit('browserPageLoaded', { id: 'm' })
    emit('messageFromWebview', { id: 'p', detail: 'from-popup' })
    expect(receive).not.toHaveBeenCalled()
  })

  it('only talks to the main webview, the first one it hears from', async () => {
    const { browser } = await createPermissionHost()
    const { emit, post, receive } = await bridgeTransport({ browser })

    emit('urlChangeEvent', { id: 'm', url: 'https://app.example/' })
    emit('urlChangeEvent', { id: 'p', url: 'https://app.example/' })
    emit('browserPageLoaded', { id: 'p' })
    emit('messageFromWebview', { id: 'p', detail: 'from-popup' })
    expect(receive).not.toHaveBeenCalled()

    post('response')
    expect(browser.postMessage).toHaveBeenCalledExactlyOnceWith({ detail: 'response', id: 'm' })
  })

  it('keeps a closed gate closed across reconnect until the webview loads the Mini App again', async () => {
    const browser = createBrowser()
    MiniAppHost.reconnect(browser as never, {
      requestUserConfirmation,
      title: 'Example',
      url: 'https://app.example',
    }, '0x1', { mainId: 'm', urlOk: false, open: false })
    const { emit, receive } = await bridgeTransport({ browser })

    emit('messageFromWebview', { id: 'm', detail: 'from-evil' })
    expect(receive).not.toHaveBeenCalled()

    emit('urlChangeEvent', { id: 'm', url: 'https://app.example/' })
    emit('browserPageLoaded', { id: 'm' })
    emit('messageFromWebview', { id: 'm', detail: 'from-app' })
    expect(receive).toHaveBeenCalledExactlyOnceWith('from-app')
  })

  it('starts closed on reconnect without a saved gate', async () => {
    const browser = createBrowser()
    MiniAppHost.reconnect(browser as never, {
      requestUserConfirmation,
      title: 'Example',
      url: 'https://app.example',
    }, '0x1')
    const { emit, receive } = await bridgeTransport({ browser })

    emit('messageFromWebview', { id: 'm', detail: 'from-evil' })
    expect(receive).not.toHaveBeenCalled()
  })
})

describe('chain approval', () => {
  it('ignores chain frames the page posts without an approval', async () => {
    const shared = { '0x1': 'https://eth-rpc.test' }
    const { host, handlers } = await createPermissionHost({ evmRpcUrls: shared })

    handlers.onChainAdded('0x1f', 'https://attacker.test')
    handlers.onChainChanged('0x1f')

    expect(getActiveMiniAppSession()).toMatchObject({ chainId: '0x1', evmRpcUrls: { '0x1': 'https://eth-rpc.test' } })
    expect(shared).toEqual({ '0x1': 'https://eth-rpc.test' })
    expect(trackWeb3Request).not.toHaveBeenCalled()
    await host.destroy()
  })

  it('ignores a switch the user rejected', async () => {
    const { host, handlers } = await createPermissionHost({ confirmed: false, evmRpcUrls: {} })

    expect(await handlers.requestChainApproval({ action: 'switch', chainId: '0x89' })).toBe(false)
    handlers.onChainChanged('0x89')

    expect(getActiveMiniAppSession()?.chainId).toBe('0x1')
    await host.destroy()
  })

  it('switches to an approved allowlisted chain but keeps the host RPC', async () => {
    const { host, handlers, requestUserConfirmation } = await createPermissionHost({ evmRpcUrls: { '0x89': 'https://polygon-rpc.test' } })

    expect(await handlers.requestChainApproval({ action: 'add', chainId: '0x89', rpcUrl: 'https://attacker.test' })).toBe(true)
    handlers.onChainChanged('0x89')

    expect(requestUserConfirmation.mock.calls[0][0].data.rpcUrl).toBeUndefined()
    expect(getActiveMiniAppSession()).toMatchObject({ chainId: '0x89', evmRpcUrls: { '0x89': 'https://polygon-rpc.test' } })
    expect(createBirpc.mock.results.at(-1)!.value.updateRpcUrl).toHaveBeenCalledWith('https://polygon-rpc.test')
    await host.destroy()
  })

  it('keeps an approved custom chain in its own session and refuses to sign on it', async () => {
    const shared = { '0x1': 'https://eth-rpc.test' }
    const { host, handlers } = await createPermissionHost({ evmRpcUrls: shared })

    await handlers.requestChainApproval({ action: 'add', chainId: '0x1f', rpcUrl: 'https://custom.test' })
    handlers.onChainChanged('0x1f')

    expect(getActiveMiniAppSession()).toMatchObject({ chainId: '0x1f', evmRpcUrls: { '0x1f': 'https://custom.test' } })
    expect(shared).toEqual({ '0x1': 'https://eth-rpc.test' })
    // Omitted chainId falls back to the current chain, which must still pass the allowlist.
    await expect((host as any).signEthTransaction({
      to: '0x2222222222222222222222222222222222222222',
      from: ethAddress,
      gas: '0x5208',
      gasPrice: '0x3b9aca00',
      nonce: '0x0',
    })).rejects.toThrow('Unsupported chainId for Ethereum transaction: 31')
    await host.destroy()
  })

  it('does not let a closing host write into a newer host session', async () => {
    const first = await createPermissionHost({ evmRpcUrls: {} })
    await first.handlers.requestChainApproval({ action: 'switch', chainId: '0x89' })

    const second = await createPermissionHost({ evmRpcUrls: {} })
    first.handlers.onChainChanged('0x89')

    expect(getActiveMiniAppSession()?.chainId).toBe('0x1')
    await first.host.destroy()
    await second.host.destroy()
  })
})

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
  featureFlags.isUsdtMaintenanceActive = false
  vi.unstubAllGlobals()
  vi.stubGlobal('Nimiq', {
    AccountType: { Basic: 0, Staking: 3 },
    Address: {
      fromString: vi.fn((address: unknown) => {
        if (typeof address !== 'string' || !address.startsWith('NQ'))
          throw new Error('Invalid address')
        return { address }
      }),
    },
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
    localAddress: { toUserFriendlyAddress: () => 'NQ11 LOCAL', toHex: () => 'local-hex' },
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
    client: {},
    consensus: 'established',
    getBalance,
    height: 0,
  })
  getBalance.mockResolvedValue({ data: 0, error: undefined })
  usePolygonUsdt.mockReturnValue({
    updateBalance,
    syncTransactionHistory,
    balance: 2_000_000,
    consensus: 'established',
    primeHtlcFee,
    sendSwapPayment,
  })
  useRemoteSigner.mockReturnValue({
    remoteHeight: 0,
    remoteAddress: { toUserFriendlyAddress: () => 'NQ11 REMOTE' },
    remoteBalance: 2_000_000,
    isHtlcActive: true,
    isRemoteOk: true,
    getWalletContext: () => ({ network: 'testnet' }),
    isWalletContextCurrent: () => true,
  })
  query.mockResolvedValue(undefined)
  run.mockResolvedValue(undefined)
  getLimits.mockResolvedValue({ current: 2_000_000 })
  primeHtlcFee.mockResolvedValue({ fee: 50_000 })
  getLightningQuote.mockResolvedValue({ status: 'PENDING_CONFIRMATION', expiry: Math.floor(Date.now() / 1e3) + 600, sell: { amount: 1_000_000 } })
  parseBitcoinLightningInvoice.mockResolvedValue({
    paymentRequest: 'lnbc1test',
    description: 'Coffee',
    expiry: 600,
    sections: [
      { name: 'payment_hash', value: 'invoice-hash' },
      { name: 'timestamp', value: Math.floor(Date.now() / 1e3) },
    ],
  })
  getPaymentRequestData.mockResolvedValue({
    data: {
      amount: 1_000_000,
      asset: 'NIM',
      transfer: 'user-payment-to-atomic-swap',
      paymentRef: 'swap-id',
      invoiced: { amount: 0.0001, currency: 'BTC' },
      swap: { fees: [] },
    },
  })
  sendTx.mockResolvedValue({ outcome: 'submitted', tx: { hash: 'payment-hash' }, serialized: 'serialized-payment' })
  selectLightningAsset.mockResolvedValue(Asset.NIM)
  sendSwapPayment.mockResolvedValue({ data: { tx: { hash: 'usdt-hash' }, serialized: 'usdt-hash' }, error: undefined })
  useTransactions.mockReturnValue({ sendTx })
})

describe('MiniAppHost Nimiq balances', () => { // eslint-disable-line test/prefer-lowercase-title
  it.each([12_345_678, 0])('returns %d luna for any valid address without requesting account access', async (balance) => {
    const address = 'NQ11 UNRELATED'
    getBalance.mockResolvedValue({ data: balance, error: undefined })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'getBalance',
      params: { address },
    })).resolves.toBe(balance)
    expect(getBalance).toHaveBeenCalledWith({ address })
    expect(confirmationPrompt).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 1, {}, { address: null }, { address: 1 }, { address: '' }, { address: 'invalid' }])('rejects malformed balance params as INVALID_REQUEST', async (params) => {
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'getBalance',
      params,
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: -32602,
      message: 'A valid Nimiq address is required',
      type: 'INVALID_REQUEST',
    })
    expect(getBalance).not.toHaveBeenCalled()
  })

  it.each([
    { client: undefined, consensus: 'established' },
    { client: {}, consensus: 'connecting' },
  ])('rejects when Nimiq network is unavailable: %s', async (network) => {
    useNimiqNetwork.mockReturnValue({ ...network, getBalance, height: 0 })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'getBalance',
      params: { address: 'NQ11 UNRELATED' },
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32000,
      type: 'NETWORK_ERROR',
    })
    expect(getBalance).not.toHaveBeenCalled()
  })

  it.each(['Error getting balance', 'Operation timed out'])('rejects failed balance lookup instead of returning zero: %s', async (error) => {
    getBalance.mockResolvedValue({ data: 0, error })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'getBalance',
      params: { address: 'NQ11 UNRELATED' },
    }).catch((reason: unknown) => JSON.parse(JSON.stringify(reason)))).resolves.toEqual({
      code: -32000,
      message: error,
      type: 'NETWORK_ERROR',
    })
  })
})

describe('MiniAppHost Nimiq send certainty', () => { // eslint-disable-line test/prefer-lowercase-title
  it.each([
    ['sendBasicTransaction', ['NQ22 RECIPIENT', 10], 'nimiq_send_transaction'],
    ['sendBasicTransactionWithData', ['NQ22 RECIPIENT', 100000, 0, 'Payment reference'], 'nimiq_send_transaction'],
    ['sendNewStakerTransaction', ['NQ33 VALIDATOR', 10], 'nimiq_staking_create_staker'],
  ])('returns -32001 with a reconciliation hash for uncertain %s', async (name, params, requestType) => {
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
        data: { hash: 'staged-hash' },
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

describe('MiniAppHost Lightning payments', () => { // eslint-disable-line test/prefer-lowercase-title
  const request = { network: 'nimiq', name: 'payLightningInvoice', params: { invoice: 'lnbc1test' } }
  function selectUsdt() {
    selectLightningAsset.mockResolvedValue(Asset.USDT)
    getPaymentRequestData.mockResolvedValue({
      data: {
        amount: 1_000_000,
        asset: 'USDT',
        transfer: 'user-payment-to-atomic-swap',
        paymentRef: 'swap-id',
        recipient: 'lnbc1test',
        invoiced: { amount: 0.0001, currency: 'BTC' },
        swap: { fees: [] },
      },
    })
  }

  it('returns at NIM submission while swap settlement continues', async () => {
    sendTx.mockImplementation(async (_payment, _context, onSubmitted) => {
      await onSubmitted('nim-hash')
      return new Promise(() => {})
    })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest(request)).resolves.toEqual({ hash: 'nim-hash', swapId: 'swap-id' })
    expect(getPaymentRequestData).toHaveBeenCalledWith('lnbc1test', 'NIM')
    expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({
      type: 'lightning-payment',
      data: expect.objectContaining({ description: 'Coffee', btcAmount: 0.0001, asset: 'NIM', amount: 1_000_000 }),
    }))
    expect(run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mini_app_lightning_payments'), expect.arrayContaining(['invoice-hash', 'https://app.example', 'NQ11 LOCAL', 'swap-id']))
    expect(run).toHaveBeenCalledWith(expect.stringContaining('UPDATE mini_app_lightning_payments'), ['nim-hash', 'submitted', expect.any(String), 'invoice-hash'])
  })

  it('lets the user choose USDT and returns when Polygon funding is submitted', async () => {
    selectUsdt()
    sendSwapPayment.mockImplementation(async (_payment, _title, options) => {
      await options.onSubmitted('usdt-hash')
      return new Promise(() => {})
    })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest(request)).resolves.toEqual({ hash: 'usdt-hash', swapId: 'swap-id' })
    expect(selectLightningAsset).toHaveBeenCalledOnce()
    expect(getPaymentRequestData).toHaveBeenCalledWith('lnbc1test', 'USDT')
    expect(getLimits).toHaveBeenCalledWith(expect.anything(), ethAddress, ethAddress)
    expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({
      type: 'lightning-payment',
      data: expect.objectContaining({ asset: 'USDT', amount: 1_000_000, usdtFeeAllowance: 50_000 }),
    }))
    expect(sendSwapPayment).toHaveBeenCalledWith(expect.anything(), 'Payment', expect.objectContaining({ expectedSender: ethAddress, maxFee: 50_000 }))
    expect(sendTx).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(expect.stringContaining('UPDATE mini_app_lightning_payments'), ['usdt-hash', 'submitted', expect.any(String), 'invoice-hash'])
  })

  it('stops before creating a quote when the asset choice is cancelled', async () => {
    selectLightningAsset.mockResolvedValue(undefined)
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'PERMISSION_DENIED' })
    expect(getPaymentRequestData).not.toHaveBeenCalled()
  })

  it('retains the invoice when Polygon funding may have been submitted', async () => {
    selectUsdt()
    sendSwapPayment.mockResolvedValue({ data: undefined, error: 'Polygon relay status unknown' })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'TRANSACTION_OUTCOME_UNKNOWN', data: { swapId: 'swap-id' } })
    expect(run).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), expect.anything())
  })

  it('returns an unknown outcome with the Polygon hash before Lightning settlement', async () => {
    selectUsdt()
    sendSwapPayment.mockImplementation(async (_payment, _title, options) => {
      await options.onFundingUncertain('pending-usdt-hash')
      return new Promise(() => {})
    })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({
      type: 'TRANSACTION_OUTCOME_UNKNOWN',
      data: { hash: 'pending-usdt-hash', swapId: 'swap-id' },
    })
    expect(run).toHaveBeenCalledWith(expect.stringContaining('UPDATE mini_app_lightning_payments'), ['pending-usdt-hash', 'unknown', expect.any(String), 'invoice-hash'])
    expect(run).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), expect.anything())
  })

  it('clears a definitely rejected Polygon attempt', async () => {
    selectUsdt()
    sendSwapPayment.mockResolvedValue({ data: undefined, error: 'Relay rejected', rejected: true })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'INVALID_TRANSACTION', message: 'Relay rejected' })
    expect(run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), [expect.any(String), 'invoice-hash'])
  })

  it('rejects USDT before confirmation during maintenance', async () => {
    selectUsdt()
    featureFlags.isUsdtMaintenanceActive = true
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'NETWORK_ERROR', message: 'USDT maintenance notice' })
    expect(confirmationPrompt).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'lightning-payment' }))
    expect(sendSwapPayment).not.toHaveBeenCalled()
  })

  it('rejects USDT when the balance cannot cover the relay fee', async () => {
    selectUsdt()
    usePolygonUsdt().balance = 1_020_000
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'INVALID_TRANSACTION', message: 'Insufficient USDT balance for payment and fee' })
    expect(sendSwapPayment).not.toHaveBeenCalled()
  })

  it('does not spend from a different Polygon wallet after ledger insertion', async () => {
    selectUsdt()
    run.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO mini_app_lightning_payments'))
        useLocalWallet().getEthAddress.mockReturnValue({ data: '0x2222222222222222222222222222222222222222', error: undefined })
    })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'NETWORK_ERROR' })
    expect(sendSwapPayment).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), [expect.any(String), 'invoice-hash'])
  })

  it('rejects a persisted invoice with its known identifiers', async () => {
    query.mockResolvedValue({ origin: 'https://app.example', owner: 'NQ11 LOCAL', swap_id: 'old-swap', tx_hash: 'old-hash' })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({
      type: 'DUPLICATE_PAYMENT',
      data: { hash: 'old-hash', swapId: 'old-swap' },
    })
    expect(getPaymentRequestData).not.toHaveBeenCalled()
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('asks for access before checking the invoice and hides another Mini App payment identifiers', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()
    confirmationPrompt.mockImplementationOnce(async () => {
      expect(query).not.toHaveBeenCalled()
      return true
    })
    query.mockResolvedValue({ origin: 'https://other.example', owner: 'NQ11 LOCAL', swap_id: 'secret-swap', tx_hash: 'secret-hash' })

    const response = await handleRequest(request).catch(error => error)
    expect(response).toMatchObject({ type: 'DUPLICATE_PAYMENT' })
    expect(response).not.toHaveProperty('data')
    expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({ type: 'lightning-access' }))
    expect(sendTx).not.toHaveBeenCalled()
  })

  it('does not check payment history when access is denied', async () => {
    const { handleRequest } = await createPermissionHost({ confirmed: false })
    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'PERMISSION_DENIED' })
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects an expired invoice before creating a swap', async () => {
    parseBitcoinLightningInvoice.mockResolvedValue({
      paymentRequest: 'lnbc1expired',
      description: 'Expired',
      expiry: Math.floor(Date.now() / 1e3) - 700,
      sections: [
        { name: 'payment_hash', value: 'expired-hash' },
        { name: 'timestamp', value: Math.floor(Date.now() / 1e3) - 1000 },
        { name: 'expiry', value: 300 },
      ],
    })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'INVALID_TRANSACTION', message: 'Bitcoin Lightning invoice expired' })
    expect(getPaymentRequestData).not.toHaveBeenCalled()
  })

  it('does not reuse pending access approval after the wallet changes', async () => {
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()
    let approveOldWallet!: (allowed: boolean) => void
    confirmationPrompt.mockImplementationOnce(() => new Promise(resolve => approveOldWallet = resolve))

    const oldWalletRequest = handleRequest(request)
    await vi.waitFor(() => expect(confirmationPrompt).toHaveBeenCalledWith(expect.objectContaining({ type: 'lightning-access' })))
    useLocalWallet().localAddress = { toUserFriendlyAddress: () => 'NQ22 NEW OWNER', toHex: () => 'new-hex' }
    const newWalletRequest = handleRequest(request)
    await expect(newWalletRequest).resolves.toMatchObject({ hash: 'payment-hash', swapId: 'swap-id' })
    approveOldWallet(true)
    await expect(oldWalletRequest).rejects.toMatchObject({ type: 'NETWORK_ERROR' })
    expect(confirmationPrompt.mock.calls.filter(([value]) => value.type === 'lightning-access')).toHaveLength(2)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('retains an uncertain staged payment and returns the staged hash', async () => {
    sendTx.mockResolvedValue({ outcome: 'unknown', stagedHash: 'staged-hash', stagedTx: { hash: 'staged-hash' }, error: 'response lost' })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({
      type: 'TRANSACTION_OUTCOME_UNKNOWN',
      data: { hash: 'staged-hash', swapId: 'swap-id' },
    })
    expect(run).toHaveBeenCalledWith(expect.stringContaining('UPDATE mini_app_lightning_payments'), ['staged-hash', 'unknown', expect.any(String), 'invoice-hash'])
    expect(run).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), expect.anything())
  })

  it('clears a definitely rejected attempt so the invoice can be retried', async () => {
    sendTx.mockResolvedValue({ outcome: 'rejected', error: 'Wallet busy' })
    const { handleRequest } = await createPermissionHost()

    await expect(handleRequest(request)).rejects.toMatchObject({ type: 'INVALID_TRANSACTION', message: 'Wallet busy' })
    expect(run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM swap_quotes'), ['swap-id'])
    expect(run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM mini_app_lightning_payments'), [expect.any(String), 'invoice-hash'])
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

  it.each([
    ['sendBasicTransaction', ['NQ22 RECIPIENT', 10]],
    ['sendNewStakerTransaction', ['NQ33 VALIDATOR', 10]],
    ['sendStakeTransaction', [10]],
  ])('rejects %s as insufficient balance for a synced never-funded wallet', async (name, params) => {
    useRemoteSigner.mockReturnValue({ remoteHeight: 0, remoteAddress: undefined, homeBalanceState: 'resolved-empty' })
    useLocalWallet.mockReturnValue({ localAddress: { toUserFriendlyAddress: () => 'NQ00 LOCAL' }, localBalance: 0 })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name,
      params,
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toEqual({
      code: -32602,
      message: 'Insufficient funds',
      type: 'INVALID_TRANSACTION',
    })
    expect(confirmationPrompt).not.toHaveBeenCalled()
    expect(sendTx).not.toHaveBeenCalled()
  })

  it.each([
    ['still syncing', 'loading', 0],
    ['receiving its first deposit', 'resolved-empty', 10],
  ])('keeps the sync error for a wallet %s', async (_, homeBalanceState, localBalance) => {
    useRemoteSigner.mockReturnValue({ remoteHeight: 0, remoteAddress: undefined, homeBalanceState })
    useLocalWallet.mockReturnValue({ localAddress: { toUserFriendlyAddress: () => 'NQ00 LOCAL' }, localBalance })
    const { handleRequest, requestUserConfirmation: confirmationPrompt } = await createPermissionHost()

    await expect(handleRequest({
      network: 'nimiq',
      name: 'sendBasicTransaction',
      params: ['NQ22 RECIPIENT', 10],
    }).catch((error: unknown) => JSON.parse(JSON.stringify(error)))).resolves.toMatchObject({
      code: -32000,
      type: 'NETWORK_ERROR',
    })
    expect(confirmationPrompt).not.toHaveBeenCalled()
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

  const foreignAddress = '0x0000000000000000000000000000000000000001'
  it.each([
    ['signTransaction', [{ to: '0x0000000000000000000000000000000000000000', from: foreignAddress, gas: '0x5208', gasPrice: '0x3b9aca00', nonce: '0x0' }]],
    ['signPersonalMessage', { data: 'hello', address: foreignAddress }],
    ['signTypedMessage', { raw: JSON.stringify({ types: {}, domain: {}, primaryType: 'Mail', message: {} }), address: foreignAddress }],
  ])('checks a mismatched %s address only after confirmation, without revealing the wallet address', async (name, params) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Unexpected RPC call')
    }))
    const signMessage = vi.fn()
    const signTypedData = vi.fn()
    useLocalWallet.mockReturnValue({
      getEthWallet: vi.fn(() => ({ data: { address: ethAddress, signTransaction, signMessage, signTypedData }, error: undefined })),
    })

    for (const confirmed of [false, true]) {
      const { handleRequest, requestUserConfirmation } = await createPermissionHost({ confirmed })

      const error = await handleRequest({ network: 'ethereum', name, params })
        .catch((error: unknown) => JSON.parse(JSON.stringify(error)))

      expect(requestUserConfirmation).toHaveBeenCalledOnce()
      expect(error).toEqual(confirmed
        ? { code: -32602, message: 'Requested address does not match the wallet address' }
        : { code: 4001, message: 'User rejected the request.' })
      expect(JSON.stringify(error)).not.toContain(ethAddress)
    }
    expect(signTransaction).not.toHaveBeenCalled()
    expect(signMessage).not.toHaveBeenCalled()
    expect(signTypedData).not.toHaveBeenCalled()
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
