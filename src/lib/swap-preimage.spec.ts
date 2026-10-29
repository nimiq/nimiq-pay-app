import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForSwapPreimage } from './swap-preimage'

const state = vi.hoisted(() => ({ getSwap: vi.fn() }))

vi.mock('@/composables/useFastspotV2', () => ({
  useFastspotApiV2: async () => ({ getSwap: state.getSwap }),
}))

vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ warn: vi.fn() }) }))

vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))

const pending = Promise.resolve({ status: 'PENDING' } as any)
const TIMEOUT_ERROR = 'Swap timed out waiting for Lightning payment confirmation'

describe('waitForSwapPreimage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state.getSwap.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries transient errors until the preimage arrives', async () => {
    state.getSwap
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'SUCCESS', preimage: 'secret' })

    const onPoll = vi.fn()
    const secret = waitForSwapPreimage('swap-id', pending, Date.now() + 600_000, undefined, onPoll)
    await vi.advanceTimersByTimeAsync(2_000)

    await expect(secret).resolves.toEqual({ preimage: 'secret', source: 'poll' })
    expect(state.getSwap).toHaveBeenCalledTimes(3)
    expect(onPoll.mock.calls).toEqual([['PENDING'], ['SUCCESS']])
  })

  it('rejects at the HTLC timeout when the swap stays pending', async () => {
    state.getSwap.mockResolvedValue({ status: 'PENDING' })

    const secret = waitForSwapPreimage('swap-id', pending, Date.now() + 120_000)
    const assertion = expect(secret).rejects.toThrow(TIMEOUT_ERROR)
    await vi.advanceTimersByTimeAsync(120_000)

    await assertion
    const calls = state.getSwap.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(state.getSwap).toHaveBeenCalledTimes(calls)
  })

  it('rejects at the deadline even when a request never settles', async () => {
    state.getSwap.mockReturnValue(new Promise(() => {}))

    const secret = waitForSwapPreimage('swap-id', pending, Date.now() + 120_000)
    const assertion = expect(secret).rejects.toThrow(TIMEOUT_ERROR)
    await vi.advanceTimersByTimeAsync(120_000)

    await assertion
  })

  it('uses the funding proof preimage', async () => {
    state.getSwap.mockReturnValue(new Promise(() => {}))
    await expect(waitForSwapPreimage('swap-id', Promise.resolve({ preimage: 'secret' } as any), Date.now() + 600_000))
      .resolves
      .toEqual({ preimage: 'secret', source: 'funding_proof' })
  })

  it('keeps polling while the funding proof never settles', async () => {
    state.getSwap.mockResolvedValue({ status: 'SUCCESS', preimage: 'secret' })

    await expect(waitForSwapPreimage('swap-id', new Promise(() => {}), Date.now() + 600_000))
      .resolves
      .toEqual({ preimage: 'secret', source: 'poll' })
  })

  it('retries a request that never settles', async () => {
    state.getSwap
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ status: 'SUCCESS', preimage: 'secret' })

    const secret = waitForSwapPreimage('swap-id', pending, Date.now() + 600_000)
    await vi.advanceTimersByTimeAsync(31_000)

    await expect(secret).resolves.toMatchObject({ preimage: 'secret' })
  })

  it('falls back to the minimum deadline for an invalid timeout', async () => {
    state.getSwap.mockResolvedValue({ status: 'PENDING' })

    const secret = waitForSwapPreimage('swap-id', pending, Number.NaN)
    const assertion = expect(secret).rejects.toThrow(TIMEOUT_ERROR)
    await vi.advanceTimersByTimeAsync(59_000)
    expect(state.getSwap.mock.calls.length).toBeGreaterThan(50)
    await vi.advanceTimersByTimeAsync(1_000)

    await assertion
  })

  it('rejects when Fastspot reports the swap expired', async () => {
    state.getSwap.mockResolvedValue({ status: 'EXPIRED' })

    await expect(waitForSwapPreimage('swap-id', pending, Date.now() + 600_000)).rejects.toThrow(TIMEOUT_ERROR)
  })

  it('rejects when the wallet context changes', async () => {
    state.getSwap.mockResolvedValue({ status: 'PENDING' })

    await expect(waitForSwapPreimage('swap-id', pending, Date.now() + 600_000, () => false))
      .rejects
      .toThrow('Wallet or network changed before sending')
  })
})
