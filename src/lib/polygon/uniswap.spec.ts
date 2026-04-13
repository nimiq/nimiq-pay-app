import { beforeEach, describe, expect, it, vi } from 'vitest'

const registeredTokenPool = vi.fn()
const fee = vi.fn()
const quoteExactInputSingleStaticCall = vi.fn()

vi.mock('ethers', async () => {
  const actual = await vi.importActual<typeof import('ethers')>('ethers')

  class MockContract {
    registeredTokenPool = registeredTokenPool
    fee = fee
    quoteExactInputSingle = {
      staticCall: quoteExactInputSingleStaticCall,
    }

    constructor(_address: string) {}
  }

  return {
    ...actual,
    Contract: MockContract,
  }
})

describe('quoteWrappedNativePrice', () => {
  beforeEach(() => {
    registeredTokenPool.mockReset()
    fee.mockReset()
    quoteExactInputSingleStaticCall.mockReset()
  })

  it('uses a static call when querying the Uniswap quoter', async () => {
    const { quoteWrappedNativePrice } = await import('./uniswap')

    registeredTokenPool.mockResolvedValue('0x00000000000000000000000000000000000000aa')
    fee.mockResolvedValue(500n)
    quoteExactInputSingleStaticCall.mockResolvedValue(1_000_000n)

    const result = await quoteWrappedNativePrice({
      provider: {} as any,
      registryAddress: '0x00000000000000000000000000000000000000bb',
      tokenAddress: '0x00000000000000000000000000000000000000cc',
      quoterAddress: '0x00000000000000000000000000000000000000dd',
      wrappedNativeTokenAddress: '0x00000000000000000000000000000000000000ee',
    })

    expect(quoteExactInputSingleStaticCall).toHaveBeenCalledOnce()
    expect(result.amountOut).toBe(1_000_000n)
  })
})
