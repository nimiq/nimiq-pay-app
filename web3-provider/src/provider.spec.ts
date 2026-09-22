import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder, TextEncoder } from 'node:util'
import { runInNewContext } from 'node:vm'
import { createBirpc } from 'birpc'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handleRequest = vi.fn()
let script: string
let closeNative: () => void

// Exercise the actual injected bundle and RPC transport used by old SDK consumers.
beforeAll(() => {
  const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  execFileSync('pnpm', ['build'], {
    cwd: packageDir,
    stdio: 'pipe',
  })
  script = readFileSync(resolve(packageDir, 'dist/provider.js'), 'utf8')
})

beforeEach(() => {
  handleRequest.mockReset()
  sessionStorage.clear()
  const native = createBirpc({ handleRequest }, {
    post: data => window.dispatchEvent(new CustomEvent('messageFromNative', { detail: data })),
    on: (receive) => {
      window.mobileApp = { postMessage: message => receive(message.detail) }
    },
  })
  closeNative = () => native.$close()
  runInNewContext(script, {
    window,
    sessionStorage,
    console,
    Buffer,
    TextDecoder,
    TextEncoder,
    Event,
    CustomEvent,
    crypto,
    setTimeout,
    clearTimeout,
  })
})

afterEach(() => {
  closeNative()
})

describe('injected provider errors', () => {
  it.each([
    ['getBalance', () => window.nimiq!.getBalance('NQ11 UNRELATED')],
    ['request(getBalance)', () => window.nimiq!.request({ method: 'getBalance', params: { address: 'NQ11 UNRELATED' } })],
  ])('forwards %s to the native bridge', async (_name, call) => {
    handleRequest.mockResolvedValue(12_345_678)

    await expect(call()).resolves.toBe(12_345_678)
    expect(handleRequest).toHaveBeenCalledWith({
      network: 'nimiq',
      name: 'getBalance',
      params: { address: 'NQ11 UNRELATED' },
      object: { address: 'NQ11 UNRELATED' },
    })
  })

  it('preserves type and RPC fields for concurrent Nimiq account requests', async () => {
    const error = { code: 4001, type: 'PERMISSION_DENIED', message: 'Permission denied' }
    handleRequest.mockRejectedValue(error)

    const results = await Promise.allSettled([
      window.nimiq!.listAccounts(),
      window.nimiq!.listAccounts(),
    ])

    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ])
    expect(handleRequest).toHaveBeenCalledTimes(1)
    expect(window.nimiq!.connected).toBe(false)
  })

  it('preserves Nimiq signing rejection without an unhandled native promise', async () => {
    const error = { code: 4001, type: 'PERMISSION_DENIED', message: 'Permission denied' }
    handleRequest.mockRejectedValue(error)

    await expect(window.nimiq!.sign('hello')).rejects.toEqual(error)
  })

  it('keeps the Ethereum rejection payload unchanged', async () => {
    handleRequest.mockRejectedValue({ code: 4001, type: 'PERMISSION_DENIED', message: 'Permission denied' })

    await expect(window.ethereum!.request({ method: 'eth_requestAccounts' })).rejects.toEqual({
      code: 4001,
      message: 'Permission denied',
    })
  })
})
