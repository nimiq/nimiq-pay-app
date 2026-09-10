import * as N from '@nimiq/core'

export type Network = 'testnet' | 'mainnet'

export function parseLuna(input: string, allowZero = true): number {
  if (!/^\d+$/.test(input))
    throw new Error('Enter whole Luna only (100,000 Luna = 1 NIM).')
  const value = Number(input)
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new Error('Amount is outside the supported range.')
  return value
}

export function formatNim(luna: number): string {
  return (luna / 100000).toLocaleString(undefined, { maximumFractionDigits: 5 })
}

export function parseNim(input: string): number {
  if (!/^\d+(?:\.\d{1,5})?$/.test(input.trim()))
    throw new Error('Enter a positive NIM amount with at most 5 decimal places.')
  const [whole, fraction = ''] = input.trim().split('.')
  return parseLuna(whole + fraction.padEnd(5, '0'), false)
}

export function validateNetwork(network: Network, id: number, cosigner: string) {
  if (id !== (network === 'testnet' ? 5 : 24) || cosigner.toLowerCase() !== (network === 'testnet' ? 'testalbatross' : 'mainalbatross'))
    throw new Error('Client and cosigner network mismatch. No transaction was signed.')
}

export function importWallet(phrase: string): N.KeyPair {
  const words = phrase.trim().toLowerCase().split(/\s+/)
  if (words.length !== 12)
    throw new Error('Enter exactly 12 recovery words.')
  try {
    N.Entropy.SIZE = 16
    return N.KeyPair.derive(N.MnemonicUtils.mnemonicToEntropy(words).toExtendedPrivateKey().derivePath('m/44\'/242\'/0\'/0\'').privateKey)
  }
  catch {
    // Core errors can include the invalid recovery word; never forward those to logs or reports.
    throw new Error('Invalid recovery words or checksum.')
  }
}

export function generateWallet() {
  N.Entropy.SIZE = 16
  const words = N.Entropy.generate().toMnemonic().join(' ')
  return { words, key: importWallet(words) }
}

export function createHtlc({ owner, publicKey, value, fee, height, networkId, expiry }: {
  owner: N.KeyPair
  publicKey: string
  value: number
  fee: number
  height: number
  networkId: number
  expiry: number
}) {
  const data = new N.SerialBuffer(82)
  data.write(owner.toAddress().serialize())
  data.write(N.PublicKey.fromHex(publicKey).toAddress().serialize())
  data.writeUint8(1)
  data.write(new Uint8Array(32))
  data.writeUint8(1)
  data.writeUint64(expiry)
  const draft = new N.Transaction(owner.toAddress(), N.AccountType.Basic, new Uint8Array(), N.Address.fromString('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'), N.AccountType.HTLC, data, BigInt(value), BigInt(fee), 1, height, networkId)
  // Contract addresses are derived with the zero recipient, then substituted before signing.
  const tx = new N.Transaction(draft.sender, draft.senderType, draft.senderData, N.Address.fromString(draft.hash().slice(0, 40)), draft.recipientType, draft.data, draft.value, draft.fee, draft.flags, draft.validityStartHeight, draft.networkId)
  tx.sign(owner, undefined)
  return tx
}

export function createSpam(key: N.KeyPair, recipient: string, runId: string, index: number, fee: number, height: number, networkId: number) {
  // Value, height and recipient can be identical. Unique data prevents hash deduplication.
  const data = new TextEncoder().encode(`htlc-lab:${runId}:${index}`)
  if (data.length > 64)
    throw new Error('Transaction tag exceeds 64 bytes.')
  const tx = N.TransactionBuilder.newBasicWithData(key.toAddress(), N.Address.fromString(recipient), data, 1n, BigInt(fee), height, networkId)
  tx.sign(key, undefined)
  return tx
}

export function createDrain(owner: N.KeyPair, address: string, value: number, fee: number, height: number, networkId: number, proofSize?: number) {
  const tx = new N.Transaction(N.Address.fromString(address), N.AccountType.HTLC, new Uint8Array(), owner.toAddress(), N.AccountType.Basic, new Uint8Array(), BigInt(value), BigInt(fee), 0, height, networkId)
  const signature = N.Signature.create(owner.privateKey, owner.publicKey, tx.serializeContent())
  const localProof = N.SignatureProof.singleSig(owner.publicKey, signature).serialize()
  const proof = new N.SerialBuffer(1 + (proofSize ?? 0) + localProof.length)
  proof.writeUint8(proofSize === undefined ? 2 : 1)
  proof.writePos += proofSize ?? 0
  proof.write(localProof)
  tx.proof = proof
  return tx
}
