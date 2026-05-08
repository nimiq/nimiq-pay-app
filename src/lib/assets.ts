import type { Crypto } from '@/stores/app'
import { i18n } from '@/i18n/i18n-setup'
import { PaymentMethod } from '@/types/transactions'

export enum Asset {
  NIM = 'NIM',
  USDT = 'USDT',
}

export enum Chain {
  Nimiq = 'Nimiq',
  Polygon = 'Polygon',
}

export interface AssetConfig {
  asset: Asset
  chain: Chain
  decimals: number
  symbol: string
  label: string
}

export const DEFAULT_ASSET = Asset.NIM

export const assetRegistry: Record<Asset, AssetConfig> = {
  [Asset.NIM]: {
    asset: Asset.NIM,
    chain: Chain.Nimiq,
    decimals: 5,
    symbol: 'NIM',
    label: 'NIM',
  },
  [Asset.USDT]: {
    asset: Asset.USDT,
    chain: Chain.Polygon,
    decimals: 6,
    symbol: 'USDT',
    label: 'USDT',
  },
}

export function getAssetConfig(asset: Asset) {
  return assetRegistry[asset]
}

export function assetToCrypto(asset: Asset): Crypto {
  return asset as unknown as Crypto
}

export function assetToPaymentMethod(asset: Asset): PaymentMethod {
  return asset === Asset.USDT ? PaymentMethod.USDT : PaymentMethod.NIM
}

export function fastspotFeeTickerToCrypto(ticker: string): Crypto | null {
  switch (ticker) {
    case Asset.NIM:
      return Asset.NIM as unknown as Crypto
    case 'BTC':
      return 'BTC' as Crypto
    case 'USDT':
      return Asset.USDT as unknown as Crypto
    default:
      return null
  }
}

/**
 * Formats a USDT amount from minor units (6 decimals) into a human-readable string.
 * Uses the app's current locale by default.
 */
export function formatUsdtAmount(amount: number, locale?: string) {
  const safeAmount = Number.isFinite(amount) ? amount / 1e6 : 0
  return `${new Intl.NumberFormat(locale ?? i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(safeAmount)} USDT`
}

/**
 * Formats a USDT amount from minor units for preview display (rounded up to 2 decimals).
 */
export function formatUsdtPreviewAmount(amount: number, suffix = 'USDT') {
  const roundedAmount = Number.isFinite(amount) ? Math.ceil(amount / 10_000) / 100 : 0
  return `${new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundedAmount)} ${suffix}`
}
