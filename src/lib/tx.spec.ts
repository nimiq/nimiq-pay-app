import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTopUpReceipt } from './tx'

const state = vi.hoisted(() => ({
  getAccountTransactions: vi.fn(),
  parseBitcoinLightningInvoice: vi.fn(),
  confirmSwap: vi.fn(),
  getSwap: vi.fn(),
  sendRemoteTransaction: vi.fn(),
  localWalletStore: {} as Record<string, any>,
  remoteSignerStore: { remoteProofSize: 98 } as Record<string, any>,
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/composables/useApi', () => ({
  useRemoteSignerApi: () => ({ sendTransaction: state.sendRemoteTransaction }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (value: string) => value },
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => state.localWalletStore,
}))

vi.mock('@/stores/nimiq-network', () => ({
  CashlinkExtraDataHex: {
    FUNDING: '0082809287',
    CLAIMING: '008b888d8a',
  },
  useNimiqNetwork: () => ({
    networkId: { value: 5 },
    height: { value: 1 },
    getAccountTransactions: state.getAccountTransactions,
  }),
}))

vi.mock('@/stores/remote-signer', () => ({
  useRemoteSigner: () => state.remoteSignerStore,
}))

vi.mock('../composables/useBitcoinLightning', () => ({
  parseBitcoinLightningInvoice: state.parseBitcoinLightningInvoice,
}))

vi.mock('../composables/useFastspotv1', () => ({
  useFastspotApiV1: () => ({
    confirmSwap: state.confirmSwap,
    getSwap: state.getSwap,
  }),
}))

function transactionWithData(raw: string, overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: 'hash',
    sender: 'NQ11 SENDER',
    senderType: 'basic',
    recipient: 'NQ22 RECIPIENT',
    recipientType: 'basic',
    value: 100,
    fee: 1,
    state: 'confirmed',
    timestamp: 1,
    data: { raw },
    proof: { raw: '' },
    ...overrides,
  } as any
}

describe('buildTopUpReceipt', () => {
  beforeEach(() => {
    state.getAccountTransactions.mockReset()
    state.getAccountTransactions.mockResolvedValue({ data: [], error: undefined })
    vi.stubGlobal('Nimiq', {
      AccountType: {
        Basic: 0,
        Vesting: 1,
        HTLC: 2,
        Staking: 3,
      },
      BufferUtils: {
        fromHex: (hex: string) => Uint8Array.from(hex.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) || []),
        toUtf8: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
      },
    })
  })

  it('marks Cashlink claims without exposing identifier bytes as a message', async () => {
    const receipt = await buildTopUpReceipt(transactionWithData('008b888d8a'))

    expect(receipt.title).toBe('Cashlink Claiming')
    expect(receipt.message).toBe('')
  })

  it('uses the Cashlink funding transaction sender as the receipt sender', async () => {
    const claim = transactionWithData('008b888d8a', {
      sender: 'NQ22 CASHLINK',
      recipient: 'NQ33 RECIPIENT',
      blockHeight: 20,
      fee: 0,
    })
    const funding = transactionWithData('0082809287', {
      transactionHash: 'funding-hash',
      sender: 'NQ44 CREATOR',
      recipient: 'NQ22 CASHLINK',
      blockHeight: 10,
    })
    state.getAccountTransactions.mockResolvedValue({ data: [claim, funding], error: undefined })

    const receipt = await buildTopUpReceipt(claim)

    expect(receipt.sender).toBe('NQ44 CREATOR')
  })

  it('keeps regular transaction data as the Top-Up message', async () => {
    const receipt = await buildTopUpReceipt(transactionWithData('48656c6c6f'))

    expect(receipt.title).toBe('Top-Up')
    expect(receipt.message).toBe('Hello')
    expect(state.getAccountTransactions).not.toHaveBeenCalled()
  })
})

describe('getSignedTx', () => {
  beforeEach(() => {
    const address = (value: string) => ({
      serialize: () => new Uint8Array(20),
      toHex: () => value,
      toUserFriendlyAddress: () => value,
    })

    class SerialBuffer extends Uint8Array {
      writePos = 0
      write() {}
      writeUint8() {}
      writeUint64() {}
    }

    class Transaction {
      sender: unknown
      recipient: unknown
      recipientType: number
      value: bigint
      networkId: number
      proof = new Uint8Array()

      constructor(sender: unknown, _senderType: number, _senderData: Uint8Array, recipient: unknown, recipientType: number, _recipientData: Uint8Array, value: bigint, _fee: bigint, _flags: number, _height: number, networkId: number) {
        this.sender = sender
        this.recipient = recipient
        this.recipientType = recipientType
        this.value = value
        this.networkId = networkId
      }

      getContractCreationAddress() {
        return address('NQ55 SWAP HTLC ADDRESS')
      }

      serializeContent() {
        return new Uint8Array()
      }

      toPlain() {
        return { sender: 'NQ11 REMOTE', recipient: 'NQ00 CONTRACT CREATION', value: Number(this.value) }
      }
    }

    state.localWalletStore = {
      localAddress: address('NQ22 LOCAL'),
      localWallet: {
        privateKey: {},
        publicKey: {},
      },
    }
    state.remoteSignerStore = {
      remoteAddress: address('NQ11 REMOTE'),
      remoteHeight: 1,
      remoteProofSize: 2,
    }
    state.parseBitcoinLightningInvoice.mockReset()
    state.parseBitcoinLightningInvoice.mockResolvedValue({ payment_hash: 'swap-hash' })
    state.confirmSwap.mockReset()
    state.confirmSwap.mockResolvedValue({
      id: 'swap-id',
      hash: 'swap-hash',
      status: 'pending',
      contracts: {
        NIM: {
          id: 'nim-contract-id',
          redeemAddress: 'NQ33 REDEEM',
          htlc: {
            data: 'expected-htlc-data',
            timeoutTime: 123456,
          },
        },
      },
    })
    state.sendRemoteTransaction.mockReset()
    vi.stubGlobal('Nimiq', {
      AccountType: { Basic: 0, HTLC: 2 },
      Address: {
        fromString: address,
        fromUserFriendlyAddress: address,
      },
      BufferUtils: {
        fromHex: () => new Uint8Array(32),
        toHex: (value: unknown) => value instanceof SerialBuffer ? 'expected-htlc-data' : 'proof',
      },
      SerialBuffer,
      Signature: { create: () => ({}) },
      SignatureProof: { singleSig: () => ({ serialize: () => new Uint8Array([1, 2]) }) },
      Transaction,
    })
  })

  it('awaits recovery persistence before calling the cosigner', async () => {
    const { getSignedTx } = await import('./tx')
    const calls: string[] = []
    state.sendRemoteTransaction.mockImplementation(async () => {
      calls.push('cosigner')
      throw new Error('stop after cosigner call')
    })

    await expect(getSignedTx({
      transfer: 'user-payment-to-atomic-swap',
      recipient: 'lnbc1invoice',
      amount: 42,
      paymentRef: 'swap-id',
    } as any, {
      beforeSwapBroadcast: async (tx, swap) => {
        calls.push('persist')
        expect(tx.getContractCreationAddress().toUserFriendlyAddress()).toBe('NQ55 SWAP HTLC ADDRESS')
        expect(swap.id).toBe('swap-id')
      },
    })).rejects.toThrow('stop after cosigner call')

    expect(calls).toEqual(['persist', 'cosigner'])
  })
})
