import { describe, expect, it, vi } from 'vitest'
import { polygonUsdtConfig } from './config'
import {
  buildTokenMetaTxDomain,
  getTokenMetaTxDomainSeparator,
  resolveTokenMetaTxDomain,
} from './token-meta-tx'

const LIVE_TOKEN_DOMAIN_SEPARATOR = '0x7b43b7deae87806d0ace67d6c8e9e347fc85db8ad198e756e5c17d126fef9a05'

describe('token meta transaction domain', () => {
  it('uses the live Polygon token name and matches the on-chain separator', async () => {
    const contract = {
      name: vi.fn().mockResolvedValue('USDT0'),
      DOMAIN_SEPARATOR: vi.fn().mockResolvedValue(LIVE_TOKEN_DOMAIN_SEPARATOR),
    }

    const domain = await resolveTokenMetaTxDomain(contract, {
      networkId: polygonUsdtConfig.networkId,
      verifyingContract: polygonUsdtConfig.tokenContract,
    })

    expect(domain.name).toBe('USDT0')
    expect(domain.version).toBe('1')
    expect(domain.verifyingContract).toBe(polygonUsdtConfig.tokenContract)
    expect(getTokenMetaTxDomainSeparator(domain)).toBe(LIVE_TOKEN_DOMAIN_SEPARATOR)
  })

  it('rejects stale token domain metadata', async () => {
    const contract = {
      name: vi.fn().mockResolvedValue('(PoS) Tether USD'),
      DOMAIN_SEPARATOR: vi.fn().mockResolvedValue(LIVE_TOKEN_DOMAIN_SEPARATOR),
    }

    await expect(resolveTokenMetaTxDomain(contract, {
      networkId: polygonUsdtConfig.networkId,
      verifyingContract: polygonUsdtConfig.tokenContract,
    })).rejects.toThrow('Token meta-transaction domain mismatch')
  })

  it('builds the current Polygon USDT domain separator', () => {
    const domain = buildTokenMetaTxDomain({
      tokenName: 'USDT0',
      networkId: polygonUsdtConfig.networkId,
      verifyingContract: polygonUsdtConfig.tokenContract,
    })

    expect(getTokenMetaTxDomainSeparator(domain)).toBe(LIVE_TOKEN_DOMAIN_SEPARATOR)
  })
})
