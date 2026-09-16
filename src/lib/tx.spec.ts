import type { PartialHtlcTxArgs } from '@/types/transactions'
import * as NimiqCore from '@nimiq/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { parseBitcoinLightningInvoice } from '../composables/useBitcoinLightning'
import { useFastspotApiV1 } from '../composables/useFastspotv1'
import { buildTopUpReceipt, getSignedTx } from './tx'

const state = vi.hoisted(() => ({
  getAccountTransactions: vi.fn(),
  localWallet: undefined as any,
  remoteAddress: { serialize: () => new Uint8Array(20), toUserFriendlyAddress: () => 'NQ11 OLD HTLC' } as any,
  remoteProofSize: 98,
  sendRemoteTransaction: vi.fn(),
}))

vi.mock('pinia', async importOriginal => ({
  ...await importOriginal<typeof import('pinia')>(),
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

vi.mock('@/lib', () => ({
  nimiqPayCosignerPublicKeys: ['c1534c708122968212c6709526801d18218ce9303590f2bca473213d99b24aaf'],
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => {
    if (state.localWallet)
      return state.localWallet
    const address = { serialize: () => new Uint8Array(20), toUserFriendlyAddress: () => 'NQ00 LOCAL', toHex: () => 'local-hex' }
    return {
      localAddress: address,
      localBalance: 100,
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
    remoteAddress: state.remoteAddress,
    remoteBalance: 100,
    remoteHeight: 1,
    remotePublicKey: 'service-public-key',
    remoteProofSize: state.remoteProofSize,
    isHtlcActive: true,
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
      AccountType: { Basic: 0, HTLC: 2, Staking: 3 },
      Address: { fromString: address, NULL: address('NQ07 0000 0000 0000 0000 0000 0000 0000 0000') },
      BufferUtils: { fromHex: () => new Uint8Array(), fromUtf8: () => new Uint8Array() },
      Policy: { STAKING_CONTRACT_ADDRESS: 'NQ00 STAKING' },
      PublicKey: { fromHex: () => ({ toAddress: () => address('NQ99 COSIGNER') }) },
      SerialBuffer: FakeSerialBuffer,
      Signature: { create: () => new Uint8Array() },
      SignatureProof: { singleSig: () => ({ serialize: () => new Uint8Array(1) }) },
      StakingDataBuilder: { addStake: () => new Uint8Array() },
      Transaction: FakeTransaction,
    })
    state.remoteAddress = address('NQ11 OLD HTLC')
    state.remoteProofSize = 98
    state.sendRemoteTransaction.mockReset()
  })

  it.each([
    ['remote payment', { transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 }],
    ['extension', { transfer: Transfer.ExtendRemote }],
    ['remote drain', { transfer: Transfer.RemoteToLocal }],
    ['immediate reclaim', { transfer: Transfer.RemoteToLocalImmediateReclaim, sender: { toUserFriendlyAddress: () => 'NQ11 OLD HTLC' }, amount: 10, proofSize: 104 }],
    ['remotely signed staking', { transfer: Transfer.Staking, amount: 10, stakingData: { type: 'add-stake' } }],
  ])('stages %s before submitting the cosigner request', async (_label, partialTx) => {
    const events: string[] = []
    state.sendRemoteTransaction.mockImplementation(async ({ tx }: any) => {
      events.push('cosigner')
      return {
        data: { details: tx.toPlain(), txSent: true },
        error: undefined,
        hasError: false,
        status: 200,
      }
    })

    const success = await getSignedTx(partialTx as any, {
      beforeRemoteBroadcast: async () => { events.push('stage') },
    })

    expect(events).toEqual(['stage', 'cosigner'])
    expect(success.outcome).toBe('signed')
  })

  it('rejects remotely signed staking without an active signer', async () => {
    state.remoteAddress = undefined

    const result = await getSignedTx({ transfer: Transfer.Staking, amount: 10, stakingData: { type: 'add-stake' } } as any)

    expect(result).toEqual({ outcome: 'rejected', error: 'Something went wrong syncing your account' })
    expect(state.sendRemoteTransaction).not.toHaveBeenCalled()
  })

  it('uses the target proof size for immediate reclaim without an active signer', async () => {
    const target = {
      serialize: () => new Uint8Array(20),
      toUserFriendlyAddress: () => 'NQ22 INACTIVE HTLC',
    }
    state.remoteAddress = undefined
    state.remoteProofSize = 98
    state.sendRemoteTransaction.mockImplementation(async ({ address, tx }: any) => ({
      data: { details: tx.toPlain(), txSent: true },
      error: undefined,
      hasError: false,
      status: 200,
      target: address,
    }))

    const result = await getSignedTx({
      transfer: Transfer.RemoteToLocalImmediateReclaim,
      sender: target as any,
      amount: 10,
      proofSize: 104,
    })

    expect(result.outcome).toBe('signed')
    expect(state.sendRemoteTransaction).toHaveBeenCalledWith(expect.objectContaining({
      address: 'NQ22INACTIVEHTLC',
      tx: expect.objectContaining({ proof: expect.objectContaining({ length: 106 }) }),
    }))
  })

  it('classifies an explicit cosigner error as rejected', async () => {
    const expectedError = 'cosigner rejected'
    state.sendRemoteTransaction.mockResolvedValue({
      data: undefined,
      error: { message: expectedError },
      hasError: true,
      status: 400,
    })

    const explicitError = await getSignedTx(
      { transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 } as any,
      { beforeRemoteBroadcast: async () => {} },
    )

    expect(explicitError).toEqual({ outcome: 'rejected', error: expectedError })
  })

  it('preserves uncertainty when a replay gets a precondition rejection', async () => {
    state.sendRemoteTransaction.mockResolvedValue({ data: undefined, error: { message: 'Service status is not good' }, hasError: true, status: 412, replayed: true })
    const result = await getSignedTx({ transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 } as any)
    expect(result.outcome).toBe('unknown')
  })

  it('classifies a structured cosigner server error after submission as unknown', async () => {
    state.sendRemoteTransaction.mockResolvedValue({
      data: undefined,
      error: { message: 'response creation failed', statusCode: 500, error: 'Internal Server Error' },
      hasError: true,
      status: 500,
    })

    const result = await getSignedTx(
      { transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 } as any,
      { beforeRemoteBroadcast: async () => {} },
    )

    expect(result).toEqual({ outcome: 'unknown', error: 'response creation failed' })
  })

  it('classifies a submitted cosigner request timeout as unknown', async () => {
    vi.useFakeTimers()
    state.sendRemoteTransaction.mockReturnValue(new Promise(() => {}))

    const result = getSignedTx(
      { transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 } as any,
      { beforeRemoteBroadcast: async () => {} },
    )
    await vi.advanceTimersByTimeAsync(30_000)
    const timeout = await result

    expect(timeout.outcome).toBe('unknown')
    vi.useRealTimers()
  })

  it.each(['timeout', 'persistence failure'])('passes swap refund metadata before cosigner submission: %s', async (scenario) => {
    vi.useFakeTimers()
    try {
      const swap = { id: 'swap-id', status: 'pending', hash: 'payment-hash', contracts: { NIM: { redeemAddress: 'NQ22 REDEEM', htlc: { data: 'swap-data', timeoutTime: 123 } } } }
      vi.mocked(useFastspotApiV1).mockResolvedValue({ confirmSwap: vi.fn().mockResolvedValue(swap) } as any)
      vi.mocked(parseBitcoinLightningInvoice).mockResolvedValue({ payment_hash: 'payment-hash' } as any)
      Nimiq.Address.fromUserFriendlyAddress = Nimiq.Address.fromString
      Nimiq.BufferUtils.toHex = () => 'swap-data'
      const staged: unknown[][] = []
      state.sendRemoteTransaction.mockReturnValue(new Promise(() => {}))
      const sending = getSignedTx({ transfer: Transfer.UserPaymentToAtomicSwap, paymentRef: 'swap-id', recipient: 'invoice', amount: 42 } as any, {
        beforeRemoteBroadcast: async (tx, metadata) => {
          staged.push([tx, metadata, state.sendRemoteTransaction.mock.calls.length])
          if (scenario === 'persistence failure')
            throw new Error('persistence failed')
        },
      })
      await vi.advanceTimersByTimeAsync(30_000)

      expect(staged).toEqual([[expect.objectContaining({ value: 42n }), swap, 0]])
      expect((await sending).outcome).toBe(scenario === 'timeout' ? 'unknown' : 'rejected')
      expect(state.sendRemoteTransaction).toHaveBeenCalledTimes(scenario === 'timeout' ? 1 : 0)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('classifies staging failure as rejected without submitting to the cosigner', async () => {
    const result = await getSignedTx(
      { transfer: Transfer.UserPayment, recipient: 'NQ22 RECIPIENT', amount: 10 } as any,
      { beforeRemoteBroadcast: async () => { throw new Error('persistence failed') } },
    )

    expect(result).toEqual({ outcome: 'rejected', error: 'persistence failed' })
    expect(state.sendRemoteTransaction).not.toHaveBeenCalled()
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

/**
 * These run against the real `@nimiq/core` rather than a stub: the point is the exact bytes the
 * consensus rules parse, which a hand-written SerialBuffer stub could never prove.
 */
describe('getSignedTx HTLC serialisation', () => {
  const SIG_PROOF_SIZE = 98 // 1 type byte + 32 public key + 1 merkle path length + 64 signature

  let localKeyPair: NimiqCore.KeyPair
  let cosignerKeyPair: NimiqCore.KeyPair
  let contract: string
  let recipient: string

  function htlcArgs(htlcData: PartialHtlcTxArgs['htlcData'], overrides: Partial<PartialHtlcTxArgs> = {}): PartialHtlcTxArgs {
    return {
      transfer: Transfer.HTLC,
      title: 'Redeem HTLC (regular)',
      sender: contract,
      recipient,
      amount: 1000,
      htlcData,
      ...overrides,
    }
  }

  function anySignatureProof() {
    const signature = NimiqCore.Signature.create(localKeyPair.privateKey, localKeyPair.publicKey, new Uint8Array([1, 2, 3]))
    return NimiqCore.SignatureProof.singleSig(localKeyPair.publicKey, signature)
  }

  beforeEach(() => {
    vi.stubGlobal('Nimiq', NimiqCore)
    localKeyPair = NimiqCore.KeyPair.generate()
    cosignerKeyPair = NimiqCore.KeyPair.generate()
    contract = NimiqCore.KeyPair.generate().toAddress().toUserFriendlyAddress()
    recipient = NimiqCore.KeyPair.generate().toAddress().toUserFriendlyAddress()
    state.localWallet = {
      localAddress: localKeyPair.toAddress(),
      localWallet: localKeyPair,
    }
    state.remoteAddress = cosignerKeyPair.toAddress()
    state.remoteProofSize = SIG_PROOF_SIZE
    state.sendRemoteTransaction.mockReset()
    state.sendRemoteTransaction.mockImplementation(({ tx }: { tx: NimiqCore.Transaction }) => ({
      data: { details: tx.toPlain(), txSent: true },
      error: undefined,
      hasError: false,
      status: 200,
    }))
  })

  describe('new-htlc creation data', () => {
    function creationData(hashRoot: Uint8Array, hashAlgorithm: number, hashCount = 1) {
      return getSignedTx(htlcArgs({
        type: 'new-htlc',
        sender: localKeyPair.toAddress(),
        recipient: cosignerKeyPair.toAddress(),
        hashRoot,
        hashCount,
        hashAlgorithm,
        timeout: 1234567890,
      }, { title: 'New HTLC' })).then(() => {
        const [{ tx }] = state.sendRemoteTransaction.mock.calls.at(-1)!
        return tx.data as Uint8Array
      })
    }

    it('lays out a 32-byte blake2b root as sender|recipient|algorithm|root|count|timeout', async () => {
      const hashRoot = new Uint8Array(32).fill(0xAB)
      const data = await creationData(hashRoot, 1, 3)

      expect(data.length).toBe(20 + 20 + 1 + 32 + 1 + 8)
      expect(data.subarray(0, 20)).toEqual(localKeyPair.toAddress().serialize())
      expect(data.subarray(20, 40)).toEqual(cosignerKeyPair.toAddress().serialize())
      expect(data[40]).toBe(1)
      expect(data.subarray(41, 73)).toEqual(hashRoot)
      expect(data[73]).toBe(3)
      expect(NimiqCore.BufferUtils.toHex(data.subarray(74, 82))).toBe('00000000499602d2')
    })

    it('grows the buffer to fit a 64-byte sha512 root instead of overflowing', async () => {
      const hashRoot = new Uint8Array(64).fill(0xCD)
      const data = await creationData(hashRoot, 4)

      expect(data.length).toBe(20 + 20 + 1 + 64 + 1 + 8)
      expect(data[40]).toBe(4)
      expect(data.subarray(41, 105)).toEqual(hashRoot)
      expect(data[105]).toBe(1)
      expect(NimiqCore.BufferUtils.toHex(data.subarray(106, 114))).toBe('00000000499602d2')
    })

    it('produces creation data the consensus rules parse back to the approved fields', async () => {
      const hashRoot = new Uint8Array(64).fill(0xCD)
      await creationData(hashRoot, 4)

      const [{ tx }] = state.sendRemoteTransaction.mock.calls.at(-1)!
      expect(tx.toPlain().data).toMatchObject({
        type: 'htlc',
        hashAlgorithm: 'sha512',
        hashRoot: NimiqCore.BufferUtils.toHex(hashRoot),
        hashCount: 1,
        timeout: 1234567890,
      })
    })
  })

  it('lays out a redeem-regular proof as type|count|algorithm|root|preImageLength|preImage|signature', async () => {
    const hashRoot = new Uint8Array(32).fill(0x11)
    const preImage = new Uint8Array(32).fill(0x22)

    const result = await getSignedTx(htlcArgs({
      type: 'redeem-regular',
      preImage,
      hashRoot,
      hashCount: 5,
      hashAlgorithm: 3,
    }))

    expect(result.outcome).toBe('signed')
    if (result.outcome !== 'signed')
      return
    const proof = result.signedTx.proof
    expect(proof.length).toBe(1 + 1 + 1 + 32 + 1 + 32 + SIG_PROOF_SIZE)
    expect(proof[0]).toBe(0) // regular transfer
    expect(proof[1]).toBe(5)
    expect(proof[2]).toBe(3)
    expect(proof.subarray(3, 35)).toEqual(hashRoot)
    expect(proof[35]).toBe(32)
    expect(proof.subarray(36, 68)).toEqual(preImage)
    expect(proof.subarray(68)).toEqual(localSignatureProofOver(result.signedTx))
  })

  it('sizes a redeem-regular proof from the actual root, so a 64-byte sha512 root fits', async () => {
    const hashRoot = new Uint8Array(64).fill(0x11)
    const preImage = new Uint8Array(64).fill(0x22)

    const result = await getSignedTx(htlcArgs({
      type: 'redeem-regular',
      preImage,
      hashRoot,
      hashCount: 1,
      hashAlgorithm: 4,
    }))

    expect(result.outcome).toBe('signed')
    if (result.outcome !== 'signed')
      return
    expect(result.signedTx.proof.length).toBe(1 + 1 + 1 + 64 + 1 + 64 + SIG_PROOF_SIZE)
  })

  it('lays out a redeem-timeout proof as type|signature', async () => {
    const result = await getSignedTx(htlcArgs({ type: 'redeem-timeout' }, { title: 'Redeem HTLC (timeout)' }))

    expect(result.outcome).toBe('signed')
    if (result.outcome !== 'signed')
      return
    const proof = result.signedTx.proof
    expect(proof.length).toBe(1 + SIG_PROOF_SIZE)
    expect(proof[0]).toBe(2) // timeout resolve
    expect(proof.subarray(1)).toEqual(localSignatureProofOver(result.signedTx))
  })

  it('lays out a redeem-early proof as type|recipientSignature|senderSignature', async () => {
    const senderSignatureProof = anySignatureProof()
    const recipientSignatureProof = anySignatureProof()

    const result = await getSignedTx(htlcArgs({
      type: 'redeem-early',
      senderSignatureProof,
      recipientSignatureProof,
    }, { title: 'Redeem HTLC (early)', validityStartHeight: 42 }))

    expect(result.outcome).toBe('signed')
    if (result.outcome !== 'signed')
      return
    const proof = result.signedTx.proof
    expect(proof.length).toBe(1 + SIG_PROOF_SIZE * 2)
    expect(proof[0]).toBe(1) // early resolve
    expect(proof.subarray(1, 1 + SIG_PROOF_SIZE)).toEqual(recipientSignatureProof.serialize())
    expect(proof.subarray(1 + SIG_PROOF_SIZE)).toEqual(senderSignatureProof.serialize())
    expect(result.signedTx.validityStartHeight).toBe(42)
  })

  function localSignatureProofOver(tx: NimiqCore.Transaction) {
    const signature = NimiqCore.Signature.create(localKeyPair.privateKey, localKeyPair.publicKey, tx.serializeContent())
    return NimiqCore.SignatureProof.singleSig(localKeyPair.publicKey, signature).serialize()
  }
})
