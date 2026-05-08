import { describe, expect, it } from 'vitest'
import { Crypto } from '@/stores/app'

import { Asset, assetRegistry, Chain, DEFAULT_ASSET, fastspotFeeTickerToCrypto, formatUsdtAmount, formatUsdtPreviewAmount, getAssetConfig } from './assets'

describe('asset registry', () => {
  it('defines NIM on Nimiq as the default asset', () => {
    expect(DEFAULT_ASSET).toBe(Asset.NIM)
    expect(getAssetConfig(Asset.NIM)).toMatchObject({
      asset: Asset.NIM,
      chain: Chain.Nimiq,
      decimals: 5,
    })
  })

  it('defines USDT on Polygon with 6 decimals', () => {
    expect(assetRegistry[Asset.USDT]).toMatchObject({
      asset: Asset.USDT,
      chain: Chain.Polygon,
      decimals: 6,
    })
  })

  it('maps supported Fastspot fee tickers to app crypto values', () => {
    expect(fastspotFeeTickerToCrypto('NIM')).toBe(Crypto.NIM)
    expect(fastspotFeeTickerToCrypto('BTC')).toBe(Crypto.BTC)
    expect(fastspotFeeTickerToCrypto('USDT')).toBe(Crypto.USDT)
    expect(fastspotFeeTickerToCrypto('USDC')).toBeNull()
  })
})

describe('usdt amount formatting', () => {
  it('formats finite USDT amounts in minor units', () => {
    expect(formatUsdtAmount(116_440_000, 'en-US')).toBe('116.44 USDT')
    expect(formatUsdtPreviewAmount(116_440_000)).toMatch(/^116\.44\s+USDT$/)
  })

  it('falls back to 0.00 for non-finite input — defends against price=0 → NaN bug', () => {
    expect(formatUsdtAmount(Number.NaN, 'en-US')).toBe('0.00 USDT')
    expect(formatUsdtAmount(Number.POSITIVE_INFINITY, 'en-US')).toBe('0.00 USDT')
    expect(formatUsdtPreviewAmount(Number.NaN)).toMatch(/^0\.00\s+USDT$/)
    expect(formatUsdtPreviewAmount(Number.NEGATIVE_INFINITY)).toMatch(/^0\.00\s+USDT$/)
  })
})
