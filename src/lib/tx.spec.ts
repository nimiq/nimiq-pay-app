import type { PartialHtlcTxArgs } from '@/types/transactions'
import * as NimiqCore from '@nimiq/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transfer } from '@/types/transactions'
import { buildTopUpReceipt, getSignedTx } from './tx'

const state = vi.hoisted(() => ({
  getAccountTransactions: vi.fn(),
  localWallet: undefined as any,
  remoteSigner: { remoteProofSize: 98 } as any,
  sendTransaction: vi.fn(),
}))

vi.mock('pinia', () => ({
  storeToRefs: <T>(store: T) => store,
}))

vi.mock('@/composables/useApi', () => ({
  useRemoteSignerApi: () => ({ sendTransaction: state.sendTransaction }),
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ log: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/i18n/i18n-setup', () => ({
  i18n: { t: (value: string) => value },
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => state.localWallet,
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
  useRemoteSigner: () => state.remoteSigner,
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
    state.remoteSigner = {
      remoteProofSize: SIG_PROOF_SIZE,
      remoteAddress: cosignerKeyPair.toAddress(),
      remoteHeight: 10,
    }
    state.sendTransaction.mockReset()
    state.sendTransaction.mockImplementation(({ tx }: { tx: NimiqCore.Transaction }) => ({
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
        const [{ tx }] = state.sendTransaction.mock.calls.at(-1)!
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

      const [{ tx }] = state.sendTransaction.mock.calls.at(-1)!
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

    const { data, error } = await getSignedTx(htlcArgs({
      type: 'redeem-regular',
      preImage,
      hashRoot,
      hashCount: 5,
      hashAlgorithm: 3,
    }))

    expect(error).toBeUndefined()
    const proof = data!.signedTx.proof
    expect(proof.length).toBe(1 + 1 + 1 + 32 + 1 + 32 + SIG_PROOF_SIZE)
    expect(proof[0]).toBe(0) // regular transfer
    expect(proof[1]).toBe(5)
    expect(proof[2]).toBe(3)
    expect(proof.subarray(3, 35)).toEqual(hashRoot)
    expect(proof[35]).toBe(32)
    expect(proof.subarray(36, 68)).toEqual(preImage)
    expect(proof.subarray(68)).toEqual(localSignatureProofOver(data!.signedTx))
  })

  it('sizes a redeem-regular proof from the actual root, so a 64-byte sha512 root fits', async () => {
    const hashRoot = new Uint8Array(64).fill(0x11)
    const preImage = new Uint8Array(64).fill(0x22)

    const { data, error } = await getSignedTx(htlcArgs({
      type: 'redeem-regular',
      preImage,
      hashRoot,
      hashCount: 1,
      hashAlgorithm: 4,
    }))

    expect(error).toBeUndefined()
    expect(data!.signedTx.proof.length).toBe(1 + 1 + 1 + 64 + 1 + 64 + SIG_PROOF_SIZE)
  })

  it('lays out a redeem-timeout proof as type|signature', async () => {
    const { data, error } = await getSignedTx(htlcArgs({ type: 'redeem-timeout' }, { title: 'Redeem HTLC (timeout)' }))

    expect(error).toBeUndefined()
    const proof = data!.signedTx.proof
    expect(proof.length).toBe(1 + SIG_PROOF_SIZE)
    expect(proof[0]).toBe(2) // timeout resolve
    expect(proof.subarray(1)).toEqual(localSignatureProofOver(data!.signedTx))
  })

  it('lays out a redeem-early proof as type|recipientSignature|senderSignature', async () => {
    const senderSignatureProof = anySignatureProof()
    const recipientSignatureProof = anySignatureProof()

    const { data, error } = await getSignedTx(htlcArgs({
      type: 'redeem-early',
      senderSignatureProof,
      recipientSignatureProof,
    }, { title: 'Redeem HTLC (early)', validityStartHeight: 42 }))

    expect(error).toBeUndefined()
    const proof = data!.signedTx.proof
    expect(proof.length).toBe(1 + SIG_PROOF_SIZE * 2)
    expect(proof[0]).toBe(1) // early resolve
    expect(proof.subarray(1, 1 + SIG_PROOF_SIZE)).toEqual(recipientSignatureProof.serialize())
    expect(proof.subarray(1 + SIG_PROOF_SIZE)).toEqual(senderSignatureProof.serialize())
    expect(data!.signedTx.validityStartHeight).toBe(42)
  })

  function localSignatureProofOver(tx: NimiqCore.Transaction) {
    const signature = NimiqCore.Signature.create(localKeyPair.privateKey, localKeyPair.publicKey, tx.serializeContent())
    return NimiqCore.SignatureProof.singleSig(localKeyPair.publicKey, signature).serialize()
  }
})
