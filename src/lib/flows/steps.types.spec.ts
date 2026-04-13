import { describe, expect, it } from 'vitest'
import { stepEmits } from './steps.types'

describe('stepEmits', () => {
  it('accepts payloads for done-like events without failing validation', () => {
    const emitValidators = stepEmits as Record<string, ((...args: any[]) => boolean) | undefined>

    expect(emitValidators.done?.({ foo: 'bar' } as any)).toBe(true)
    expect(emitValidators.select?.('value' as any)).toBe(true)
    expect(emitValidators.back?.('qrCodeScanner' as any)).toBe(true)
    expect(emitValidators.skip?.()).toBe(true)
    expect(emitValidators.focus?.()).toBe(true)
  })
})
