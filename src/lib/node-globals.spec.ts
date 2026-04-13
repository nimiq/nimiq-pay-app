/* eslint-disable node/prefer-global/buffer */
import type { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNodeGlobals } from './node-globals'

interface TestGlobals {
  Buffer?: typeof Buffer
  global?: typeof globalThis
  process?: {
    nextTick?: (...args: any[]) => void
    browser?: boolean
  }
}

describe('installNodeGlobals', () => {
  const testGlobals = globalThis as unknown as TestGlobals

  let originalBuffer: typeof Buffer | undefined
  let originalGlobal: typeof globalThis | undefined
  let originalProcess: TestGlobals['process']

  beforeEach(() => {
    vi.resetModules()

    originalBuffer = testGlobals.Buffer
    originalGlobal = testGlobals.global
    originalProcess = testGlobals.process

    Reflect.deleteProperty(testGlobals, 'Buffer')
    Reflect.deleteProperty(testGlobals, 'global')
    Reflect.deleteProperty(testGlobals, 'process')
  })

  afterEach(() => {
    if (originalBuffer)
      testGlobals.Buffer = originalBuffer
    else Reflect.deleteProperty(testGlobals, 'Buffer')

    if (originalGlobal)
      testGlobals.global = originalGlobal
    else Reflect.deleteProperty(testGlobals, 'global')

    if (originalProcess)
      testGlobals.process = originalProcess
    else Reflect.deleteProperty(testGlobals, 'process')
  })

  it('provides browser globals required by legacy OpenGSN dependencies', () => {
    expect(installNodeGlobals).toBeTypeOf('function')

    installNodeGlobals()

    expect(testGlobals.global).toBe(globalThis)
    expect(typeof testGlobals.Buffer?.from).toBe('function')
    expect(typeof testGlobals.process?.nextTick).toBe('function')
    expect(testGlobals.process?.browser).toBe(true)
  })
})
