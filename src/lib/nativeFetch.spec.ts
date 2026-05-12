import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  request: vi.fn(),
  logger: {
    error: vi.fn(),
  },
}))

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: state.request,
  },
}))

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => state.logger,
}))

describe('nativeFetch', () => {
  beforeEach(() => {
    state.request.mockReset()
    state.logger.error.mockReset()
  })

  it('logs rejected native HTTP requests with request context', async () => {
    const error = new Error('network down')
    state.request.mockRejectedValue(error)
    const { nativeFetch } = await import('./nativeFetch')

    await expect(nativeFetch(new URL('https://example.test/api'), { method: 'POST', body: '{"ok":true}' })).rejects.toThrow('network down')

    expect(state.logger.error).toHaveBeenCalledWith('Native fetch request failed', error, expect.objectContaining({
      url: 'https://example.test/api',
      method: 'POST',
      body: '{"ok":true}',
    }))
  })

  it('logs non-200 native HTTP responses with response context', async () => {
    state.request.mockResolvedValue({
      status: 500,
      headers: { 'content-type': 'application/json' },
      data: { message: 'server exploded' },
    })
    const { nativeFetch } = await import('./nativeFetch')

    const response = await nativeFetch('https://example.test/api')

    expect(response.status).toBe(500)
    expect(state.logger.error).toHaveBeenCalledWith('Native fetch returned non-200 response', expect.objectContaining({
      url: 'https://example.test/api',
      method: 'GET',
      status: 500,
      responseBody: { message: 'server exploded' },
    }))
  })
})
