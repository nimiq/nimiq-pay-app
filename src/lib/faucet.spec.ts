import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  nativeFetch: vi.fn(),
  logger: { error: vi.fn() },
}))

vi.mock('./nativeFetch', () => ({
  nativeFetch: state.nativeFetch,
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

// Translate by echoing the key with interpolated params, so assertions stay readable.
vi.mock('@/i18n/i18n-setup', () => ({
  i18n: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? key.replace(/\{(\w+)\}/g, (_, k) => String(params[k])) : key,
  },
}))

function jsonResponse(data: unknown) {
  return { json: async () => data }
}

describe('faucet', () => {
  beforeEach(() => {
    state.nativeFetch.mockReset()
    state.logger.error.mockReset()
  })

  describe('tapFaucet', () => {
    it('posts the address to /tapit and returns success', async () => {
      state.nativeFetch.mockResolvedValue(jsonResponse({ success: true }))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')

      expect(res).toEqual({ data: true, error: undefined })
      const [url, options] = state.nativeFetch.mock.calls[0]
      expect(url).toBe('https://faucet.pos.nimiq-testnet.com/tapit')
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({ address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' })
    })

    it('maps RATE_LIMIT to a wait-time message (hours, rounded up)', async () => {
      state.nativeFetch.mockResolvedValue(jsonResponse({ success: false, error: 'RATE_LIMIT', wait: 3700 }))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07')

      expect(res.data).toBeUndefined()
      expect(res.error).toBe('You can receive more free NIM in 2 hours.')
    })

    it('maps GEOBLOCKED', async () => {
      state.nativeFetch.mockResolvedValue(jsonResponse({ success: false, error: 'GEOBLOCKED' }))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07')
      expect(res.error).toBe('This service is currently not available in your region.')
    })

    it('maps OUT_OF_FUNDS', async () => {
      state.nativeFetch.mockResolvedValue(jsonResponse({ success: false, error: 'OUT_OF_FUNDS' }))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07')
      expect(res.error).toBe('There are currently no free NIM available.')
    })

    it('maps unknown errors to a generic message', async () => {
      state.nativeFetch.mockResolvedValue(jsonResponse({ success: false, error: 'SOMETHING_ELSE' }))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07')
      expect(res.error).toBe('Request failed')
    })

    it('returns a generic error when the request throws', async () => {
      state.nativeFetch.mockRejectedValue(new Error('network down'))
      const { tapFaucet } = await import('./faucet')

      const res = await tapFaucet('NQ07')
      expect(res.error).toBe('Request failed')
      expect(state.logger.error).toHaveBeenCalled()
    })
  })
})
