import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIssuerRestApi } from './issuer-rest-api'

const fetchMock = vi.fn()

vi.mock('@/composables/useLogger', () => ({
  useLogger: () => ({ error: vi.fn() }),
}))

vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: {
      toUserFriendlyAddress: () => 'NQ00 TEST',
    },
    localWallet: {},
  }),
}))

describe('useIssuerRestApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new Error('Retired issuer server contacted'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects locally without contacting the retired issuer server', async () => {
    const { getUserStatus } = useIssuerRestApi()

    await expect(getUserStatus()).rejects.toThrow('Issuer API disabled: GET /user/status')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
