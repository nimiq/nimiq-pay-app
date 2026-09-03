import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { buildTopUpReceipt, getSignedTx } from './tx'

const state = vi.hoisted(() => ({
  getAccountTransactions: vi.fn(),
  sendRemoteTransaction: vi.fn(),
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
  useLocalWallet: () => {
    const address = { serialize: () => new Uint8Array(20), toUserFriendlyAddress: () => 'NQ00 LOCAL' }
    return {
      localAddress: address,
      localWallet: { privateKey: {}, publicKey: {}, toAddress: () => address },
    }
  },
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
  useRemoteSigner: () => ({
    remoteAddress: { serialize: () => new Uint8Array(20), toUserFriendlyAddress: () => 'NQ11 OLD HTLC' },
    remoteBalance: 100,
    remotePublicKey: 'service-public-key',
    remoteProofSize: 98,
  }),
}))

vi.mock('../composables/useBitcoinLightning', () => ({
  parseBitcoinLightningInvoice: vi.fn(),
}))

vi.mock('../composables/useFastspotv1', () => ({
  useFastspotApiV1: vi.fn(),
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

describe('getSignedTx', () => {
  beforeEach(() => {
    class FakeSerialBuffer extends Uint8Array {
      writePos = 0
      write(_value: Uint8Array) {}
      writeUint8(_value: number) {}
      writeUint64(_value: number) {}
    }
    class FakeTransaction {
      proof = new Uint8Array()

      constructor(
        readonly sender: any,
        readonly senderType: number,
        readonly senderData: Uint8Array,
        readonly recipient: any,
        readonly recipientType: number,
        readonly data: Uint8Array,
        readonly value: bigint,
        readonly fee: bigint,
        readonly flags: number,
        readonly validityStartHeight: number,
        readonly networkId: number,
      ) {}

      hash() { return 'a'.repeat(64) }
      serializeContent() { return new Uint8Array() }
      toHex() { return 'signed-transaction' }
      toPlain() {
        return {
          transactionHash: this.hash(),
          sender: this.sender.toUserFriendlyAddress(),
          senderType: this.senderType,
          recipient: this.recipient.toUserFriendlyAddress(),
          recipientType: this.recipientType,
          value: Number(this.value),
          fee: Number(this.fee),
          flags: this.flags,
          validityStartHeight: this.validityStartHeight,
          data: { raw: '' },
          proof: { raw: '' },
        }
      }
    }
    const address = (value: string) => ({
      serialize: () => new Uint8Array(20),
      toUserFriendlyAddress: () => value,
    })
    vi.stubGlobal('Nimiq', {
      AccountType: { Basic: 0, HTLC: 2 },
      Address: { fromString: address },
      BufferUtils: { fromHex: () => new Uint8Array() },
      PublicKey: { fromHex: () => ({ toAddress: () => address('NQ99 COSIGNER') }) },
      SerialBuffer: FakeSerialBuffer,
      Signature: { create: () => new Uint8Array() },
      SignatureProof: { singleSig: () => ({ serialize: () => new Uint8Array(1) }) },
      Transaction: FakeTransaction,
    })
    state.sendRemoteTransaction.mockReset()
  })

  it('persists an extension before the cosigner request can broadcast it', async () => {
    const order: string[] = []
    state.sendRemoteTransaction.mockImplementation(async ({ tx }: any) => {
      order.push('cosigner')
      return {
        data: { details: tx.toPlain(), txSent: true },
        error: undefined,
        hasError: false,
        status: 200,
      }
    })

    const result = await getSignedTx(
      { transfer: Transfer.ExtendRemote } as any,
      { beforeRemoteBroadcast: async () => { order.push('persist') } },
    )

    expect(result.error).toBeUndefined()
    expect(order).toEqual(['persist', 'cosigner'])
  })
})

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

  it('uses the HTLC owner as sender when Nimiq Pay cosigned the deposit', async () => {
    const receipt = await buildTopUpReceipt(transactionWithData('', {
      sender: 'NQ33 NIMIQ PAY HTLC',
      senderType: 'htlc',
      proof: {
        type: 'early-resolve',
        publicKey: 'c1534c708122968212c6709526801d18218ce9303590f2bca473213d99b24aaf',
        creator: 'NQ44 HTLC OWNER',
        raw: '',
      },
    }))

    expect(receipt.sender).toBe('NQ44 HTLC OWNER')
    expect(receipt.senderType).toBe(0)
  })

  it('keeps an HTLC sender when its cosigner is unknown', async () => {
    const receipt = await buildTopUpReceipt(transactionWithData('', {
      sender: 'NQ33 FOREIGN HTLC',
      senderType: 'htlc',
      proof: {
        type: 'early-resolve',
        publicKey: 'unknown-cosigner',
        creator: 'NQ44 HTLC OWNER',
        raw: '',
      },
    }))

    expect(receipt.sender).toBe('NQ33 FOREIGN HTLC')
    expect(receipt.senderType).toBe(2)
  })
})
