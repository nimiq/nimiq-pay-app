import type { ConsensusState, Transaction } from '@nimiq/core'
import type { ExternalTransaction } from '@/types/transactions'
import { i18n } from '@/i18n/i18n-setup'
import { Crypto, DECIMALS, useApp } from '@/stores/app'

// Decodes a `GetTransactionByHash` row. Callers may re-save it, and upsertTx expects parsed JSON.
export function parseStoredTransaction(tx: ExternalTransaction | null) {
  if (!tx)
    return null

  tx.invoiced = typeof tx.invoiced === 'string' ? JSON.parse(tx.invoiced) : tx.invoiced
  tx.meta = typeof tx.meta === 'string' ? JSON.parse(tx.meta) : tx.meta
  return tx
}

export function getLegacyTransactionValidityStartHeight(
  row: { hash: string, sender: string, recipient: string, raw?: string | null },
  expectedNetworkId: number,
): number | undefined {
  if (!row.raw || !/^(?:[\da-f]{2})+$/i.test(row.raw))
    return undefined
  let transaction: Transaction | undefined
  try {
    // Legacy raw is signing content, not a signed transaction. Accept only an exact Core round-trip.
    const bytes = Nimiq.BufferUtils.fromHex(row.raw)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const dataLength = view.getUint16(0)
    const recipientDataEnd = 2 + dataLength
    // The Core round-trip below validates the decoded fields and canonical encoding.
    if (bytes.length < recipientDataEnd + 65)
      return undefined
    const fields = new DataView(bytes.buffer, bytes.byteOffset + recipientDataEnd, 65)
    const senderType = fields.getUint8(20)
    if (fields.getUint8(62) !== expectedNetworkId) {
      return undefined
    }
    // Sender data uses an unsigned base-128 length, unlike the recipient's uint16 length.
    let senderDataOffset = recipientDataEnd + 64
    let senderDataLength = 0
    let shift = 0
    let lengthByte: number
    do {
      if (senderDataOffset >= bytes.length || shift > 28)
        return undefined
      lengthByte = bytes[senderDataOffset++]!
      senderDataLength += (lengthByte & 0x7F) * 2 ** shift
      shift += 7
    } while (lengthByte & 0x80)
    if (senderDataOffset + senderDataLength !== bytes.length)
      return undefined
    transaction = new Nimiq.Transaction(
      Nimiq.Address.fromString(row.sender),
      senderType,
      bytes.slice(senderDataOffset),
      Nimiq.Address.fromString(row.recipient),
      fields.getUint8(41),
      bytes.slice(2, recipientDataEnd),
      fields.getBigUint64(42),
      fields.getBigUint64(50),
      fields.getUint8(63),
      fields.getUint32(58),
      expectedNetworkId,
    )
    if (transaction.hash() !== row.hash
      || transaction.recipient.toUserFriendlyAddress() !== row.recipient
      || Nimiq.BufferUtils.toHex(transaction.serializeContent()).toLowerCase() !== row.raw.toLowerCase()) {
      return undefined
    }
    return transaction.validityStartHeight
  }
  catch {
    return undefined
  }
  finally {
    transaction?.free()
  }
}

/**
 * Execute a promise or throw an error if it takes longer than the specified timeout.
 */
export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs} milliseconds`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
    .finally(() => window.clearTimeout(timeoutId))
}

export function base64ToImageData(base64Str: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    // If the base64 string is missing the prefix, assume it's a PNG.
    const dataURL = base64Str.startsWith('data:')
      ? base64Str
      : `data:image/png;base64,${base64Str}`

    const img = new Image()

    img.onload = () => {
      const canvas: HTMLCanvasElement = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Unable to get 2D context'))
        return
      }

      ctx.drawImage(img, 0, 0)

      try {
        const imageData: ImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve(imageData)
      }
      catch (err) {
        reject(err)
      }
    }

    img.onerror = (err) => {
      reject(err)
    }

    img.src = dataURL
  })
}

export function translateConsensus(consensusState: ConsensusState) {
  // Define translations as record such that ts warns us if a translation for a consensus state is missing
  const consensusStateTranslations: Record<ConsensusState, string> = {
    established: i18n.t('Consensus established.'),
    syncing: i18n.t('Syncing with network.'),
    connecting: i18n.t('Connecting to network.'),
  }
  return Object.keys(consensusStateTranslations).includes(consensusState)
    ? consensusStateTranslations[consensusState]
    : consensusStateTranslations.syncing
}

export const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

export function roundUpToTwoDecimals(amount: number) {
  return Math.ceil(amount * 100) / 100
}

export function calculateDisplayedDecimals(amount: number | null, currency: Crypto) {
  if (amount === null)
    return 0

  const decimals = useApp().decimalsAmount
  const btcDecimals = DECIMALS.BTC
  const usdtDecimals = 2

  if (currency === Crypto.BTC) {
    const maxDecimals = btcDecimals
    if (amount === 0)
      return maxDecimals

    // if (btcUnit.value.ticker === 'mBTC') {
    //   // For mBTC, make sure that 2 significant digits are always displayed
    //   if (amount < 0.001 * 1e5)
    //     return 5
    //   if (amount < 0.01 * 1e5)
    //     return Math.max(maxDecimals, 4)
    //   if (amount < 0.1 * 1e5)
    //     return Math.max(maxDecimals, 3)
    //   if (amount < 1 * 1e5)
    //     return Math.max(maxDecimals, 2)
    //   if (amount < 10 * 1e5)
    //     return Math.max(maxDecimals, 1)
    // }
    // else {
    // For BTC, make sure that 3 significant digits are always displayed
    if (amount < 0.00001 * 1e8)
      return 8
    if (amount < 0.0001 * 1e8)
      return Math.max(maxDecimals, 7)
    if (amount < 0.001 * 1e8)
      return Math.max(maxDecimals, 6)
    if (amount < 0.01 * 1e8)
      return Math.max(maxDecimals, 5)
    if (amount < 0.1 * 1e8)
      return Math.max(maxDecimals, 4)
    if (amount < 1 * 1e8)
      return Math.max(maxDecimals, 3)
    if (amount < 10 * 1e8)
      return Math.max(maxDecimals, 2)
    if (amount < 100 * 1e8)
      return Math.max(maxDecimals, 1)
    // }
    return maxDecimals
  }

  if (currency === Crypto.USDT) {
    const maxDecimals = Math.max(usdtDecimals, decimals)
    if (amount === 0)
      return maxDecimals
    if (amount < 0.0001 * 1e6)
      return 6
    if (amount < 0.001 * 1e6)
      return Math.max(maxDecimals, 5)
    if (amount < 0.01 * 1e6)
      return Math.max(maxDecimals, 4)
    if (amount < 0.1 * 1e6)
      return Math.max(maxDecimals, 3)
    if (amount < 1 * 1e6)
      return Math.max(maxDecimals, 2)
    if (amount < 10 * 1e6)
      return Math.max(maxDecimals, 1)
    return maxDecimals
  }

  // For NIM, make sure that 2 significant digits are always displayed
  if (amount === 0)
    return decimals
  if (amount < 0.001 * 1e5)
    return 5
  if (amount < 0.01 * 1e5)
    return Math.max(decimals, 4)
  if (amount < 0.1 * 1e5)
    return Math.max(decimals, 3)
  if (amount < 1 * 1e5)
    return Math.max(decimals, 2)
  if (amount < 10 * 1e5)
    return Math.max(decimals, 1)
  return decimals
}

// iOS Lockdown Mode disables WebAssembly in WKWebView, which is exactly what the
// Nimiq client needs (`Nimiq.default()`). Validate a minimal module to detect it.
export function isWasmAvailable(): boolean {
  return typeof WebAssembly === 'object'
    && typeof WebAssembly.validate === 'function'
    && WebAssembly.validate(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0))
}
