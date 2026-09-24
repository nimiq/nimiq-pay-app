import { bech32 } from 'bech32'
import { decode } from 'light-bolt11-decoder'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('light-bolt11-decoder', () => ({ decode: vi.fn() }))

const postMessage = vi.fn()
const workerScope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number, type: 'invoice' | 'lnurl', value: string }>) => void }

beforeAll(async () => {
  vi.stubGlobal('postMessage', postMessage)
  await import('./bitcoin-lightning.worker')
})
beforeEach(() => {
  vi.clearAllMocks()
})
afterAll(() => vi.unstubAllGlobals())

describe('bitcoin Lightning decoder worker', () => {
  it('transfers non-enumerable invoice fields to the caller', () => {
    const invoice = { sections: [{ name: 'payment_hash', value: 'hash' }], paymentRequest: 'lnbc1test' }
    Object.defineProperties(invoice, {
      description: { get: () => 'Coffee' },
      expiry: { get: () => 3600 },
      payment_hash: { get: () => 'hash' },
      route_hints: { get: () => [[{ fee_base_msat: 1000 }]] },
    })
    vi.mocked(decode).mockReturnValue(invoice as ReturnType<typeof decode>)

    workerScope.onmessage({ data: { id: 1, type: 'invoice', value: 'lnbc1test' } } as MessageEvent)

    expect(postMessage).toHaveBeenCalledWith({
      id: 1,
      ok: true,
      value: expect.objectContaining({ description: 'Coffee', expiry: 3600, payment_hash: 'hash', route_hints: [[{ fee_base_msat: 1000 }]], sections: invoice.sections }),
    })
  })

  it('decodes an LNURL callback in the worker', () => {
    const callback = 'https://example.com/lnurl'
    const lnurl = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(callback)), 500)

    workerScope.onmessage({ data: { id: 2, type: 'lnurl', value: lnurl } } as MessageEvent)

    expect(postMessage).toHaveBeenCalledWith({ id: 2, ok: true, value: callback })
  })
})
