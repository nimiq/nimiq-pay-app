import type { ConsensusState } from '@nimiq/core'
import { i18n } from '@/i18n/i18n-setup'
import { Crypto, DECIMALS, useApp } from '@/stores/app'

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
