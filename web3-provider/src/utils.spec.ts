import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateUUID } from './utils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generateUUID', () => {
  it.each([true, false])('generates distinct UUIDv4 values with randomUUID available: %s', (hasRandomUUID) => {
    vi.stubGlobal('crypto', hasRandomUUID
      ? webcrypto
      : { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('UUIDs must use cryptographic randomness')
    })

    const uuids = Array.from({ length: 100 }, () => generateUUID())

    expect(new Set(uuids).size).toBe(100)
    for (const uuid of uuids)
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
