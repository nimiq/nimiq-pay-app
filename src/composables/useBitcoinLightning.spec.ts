import { bech32 } from 'bech32'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseBitcoinLightningInvoice } from './useBitcoinLightning'

vi.mock('@/composables/useLogger', () => ({ useLogger: () => ({ error: vi.fn() }) }))
vi.mock('@/i18n/i18n-setup', () => ({ i18n: { t: (message: string) => message } }))

const requests: Array<{ id: number, type: 'invoice' | 'lnurl', value: string }> = []
const decoded = { sections: [], description: 'Coffee', payment_hash: 'hash' }
let respond = true
let terminatedWorkers = 0

class FakeWorker {
  onmessage?: (event: MessageEvent) => void
  onerror?: () => void
  onmessageerror?: () => void

  postMessage(request: typeof requests[number]) {
    requests.push(request)
    if (!respond)
      return
    queueMicrotask(() => this.onmessage?.({ data: { id: request.id, ok: true, value: request.type === 'lnurl' ? 'https://example.com/lnurl' : decoded } } as MessageEvent))
  }

  terminate() { terminatedWorkers++ }
}

beforeAll(() => vi.stubGlobal('Worker', FakeWorker))
afterEach(() => {
  respond = true
  vi.useRealTimers()
})
afterAll(() => vi.unstubAllGlobals())

describe('bitcoin Lightning invoice parsing', () => {
  it('sends long invoices to a worker without a length cutoff', async () => {
    const invoice = `lnbc${'a'.repeat(90_000)}`

    await expect(parseBitcoinLightningInvoice(invoice)).resolves.toEqual(decoded)
    expect(requests.at(-1)).toMatchObject({ type: 'invoice', value: invoice })
  })

  it('also decodes LNURL and its returned invoice in the worker', async () => {
    const lnurl = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode('https://example.com/lnurl')), 500)
    const invoice = `lnbc${'a'.repeat(90_000)}`
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tag: 'payRequest', callback: 'https://example.com/callback', minSendable: 1000, maxSendable: 1000, metadata: '[]' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pr: invoice }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(parseBitcoinLightningInvoice(lnurl)).resolves.toMatchObject({ description: '' })
    expect(requests.slice(-2)).toMatchObject([{ type: 'lnurl', value: lnurl }, { type: 'invoice', value: invoice }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('restarts a stalled worker so later payments can proceed', async () => {
    respond = false
    vi.useFakeTimers()
    const first = expect(parseBitcoinLightningInvoice('lnbc1stuck')).rejects.toThrow('decoding timed out')
    const second = expect(parseBitcoinLightningInvoice('lnbc1queued')).rejects.toThrow('decoding timed out')

    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all([first, second])
    expect(terminatedWorkers).toBe(1)

    respond = true
    vi.useRealTimers()
    await expect(parseBitcoinLightningInvoice('lnbc1next')).resolves.toEqual(decoded)
  })
})
