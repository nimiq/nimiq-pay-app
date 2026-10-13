import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  appendFile: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { appendFile: state.appendFile },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))
vi.mock('@capawesome/capacitor-posthog', () => ({ Posthog: { captureException: state.captureException } }))

const ADDRESS = 'NQ80 E3XT 79B1 D8U8 EFDN FHB0 MSGX 1NR5 MYMQ'
const HASH = 'aeccd4102ca2ff31db52e042e3619dd70e032a07b452fb4118ba93e48011600c'

async function loadLogger(name = 'test') {
  const { useLogger } = await import('./useLogger')
  return useLogger(name)
}

// Reports run after a microtask so a failing PostHog call can't throw into the caller.
async function flushReports() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  state.appendFile.mockReset()
  state.captureException.mockReset()
  vi.stubEnv('DEV', false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useLogger', () => {
  it('writes Error messages to the log file instead of {}', async () => {
    const logger = await loadLogger()
    logger.error('Failed to activate included HTLC signer', new Error('Cannot activate remote signer from invalid HTLC transaction'))
    await logger.forceSaveToFile()

    const data = state.appendFile.mock.calls[0][0].data as string
    expect(data).toContain('Cannot activate remote signer from invalid HTLC transaction')
    expect(data).toContain('"name": "Error"')
  })

  it('reports errors to PostHog with tx hashes but without addresses or payloads', async () => {
    const logger = await loadLogger('remote-signer')
    logger.error(`History pagination made no progress for ${ADDRESS}`, new TypeError(`bad ${ADDRESS}`), { transactionHash: HASH, balance: 123 })
    await flushReports()

    expect(state.captureException).toHaveBeenCalledOnce()
    const report = state.captureException.mock.calls[0][0]
    expect(report.name).toBe('TypeError')
    expect(report.message).toBe('History pagination made no progress for NQ…: bad NQ…')
    expect(report.properties).toMatchObject({ logger: 'remote-signer', tx_hashes: [HASH] })
    expect(JSON.stringify(report)).not.toContain('E3XT')
    expect(JSON.stringify(report)).not.toContain('balance')
  })

  it('sends only the first string, without URL query strings', async () => {
    const logger = await loadLogger('useApi')
    logger.error('Error fetching https://points.nimpay.app/api/user?phone=+34600000000#x', 'witch collapse practice feed shame open', { content: 'seed words' })
    await flushReports()

    const report = state.captureException.mock.calls[0][0]
    expect(report.message).toBe('Error fetching https://points.nimpay.app/api/user?…')
    expect(JSON.stringify(report)).not.toContain('600000000')
    expect(JSON.stringify(report)).not.toContain('witch')
    expect(JSON.stringify(report)).not.toContain('seed words')
  })

  it('collapses 32-byte hex in messages so one error keeps one throttle key', async () => {
    const logger = await loadLogger('transactions')
    logger.error(`Upsert-ing transaction ${HASH} failed`, new Error('db'))
    logger.error(`Upsert-ing transaction ${'b'.repeat(64)} failed`, new Error('db'))
    await flushReports()

    expect(state.captureException).toHaveBeenCalledOnce()
    expect(state.captureException.mock.calls[0][0].message).toBe('Upsert-ing transaction … failed: db')
  })

  it('does not report an error nested in an object', async () => {
    const logger = await loadLogger('useStringParser')
    logger.error('Error invalid URL', { content: 'seed words', error: new TypeError('URL constructor: seed words is not a valid URL.') })
    await flushReports()

    expect(state.captureException.mock.calls[0][0].message).toBe('Error invalid URL')
    expect(JSON.stringify(state.captureException.mock.calls[0][0])).not.toContain('seed words')
  })

  it('reports an API error object with its status code', async () => {
    const logger = await loadLogger('useApi')
    logger.error('Request failed:', { message: 'Wallet no longer active', statusCode: 409 })
    await flushReports()

    expect(state.captureException.mock.calls[0][0].properties).toMatchObject({ error_message: 'Wallet no longer active', error_status: 409 })
  })

  it('reports the same error once per throttle window', async () => {
    const logger = await loadLogger()
    logger.error('Error while getting remote balance', new Error('timeout'))
    logger.error('Error while getting remote balance', new Error('timeout'))
    logger.error('Error while getting remote balance', new Error('other'))
    await flushReports()

    expect(state.captureException).toHaveBeenCalledTimes(2)
  })

  it('caps reports per session, counting repeats after the throttle window', async () => {
    vi.useFakeTimers()
    try {
      const logger = await loadLogger()
      for (let round = 0; round < 25; round++) {
        for (let i = 0; i < 10; i++)
          logger.error(`recurring error ${i}`)
        vi.advanceTimersByTime(10 * 60 * 1e3)
      }
      await flushReports()
      expect(state.captureException).toHaveBeenCalledTimes(200)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not report from dev builds', async () => {
    vi.stubEnv('DEV', true)
    const logger = await loadLogger()
    logger.error('boom')
    await flushReports()

    expect(state.captureException).not.toHaveBeenCalled()
  })

  it('keeps logging when PostHog throws', async () => {
    state.captureException.mockImplementation(() => {
      throw new Error('plugin missing')
    })
    const logger = await loadLogger()
    expect(() => logger.error('boom')).not.toThrow()
    await flushReports()
  })
})
