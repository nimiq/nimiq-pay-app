import { describe, expect, it } from 'vitest'
import { Crypto } from '@/stores/app'

import { Asset, assetRegistry, Chain, DEFAULT_ASSET, fastspotFeeTickerToCrypto, getAssetConfig } from './assets'

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
