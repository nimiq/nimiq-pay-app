import jsSHA from 'jssha'
import { describe, expect, it } from 'vitest'
import { readWidgetImage } from './mini-app-widget-images'
import { WIDGET_LIMITS } from './mini-app-widgets'

function sha256(bytes: Uint8Array): string {
  // eslint-disable-next-line new-cap
  return new jsSHA('SHA-256', 'UINT8ARRAY').update(bytes).getHash('HEX')
}

function base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
}

function ascii(text: string): number[] {
  return [...text].map(c => c.charCodeAt(0))
}

function be32(n: number): number[] {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, ...ascii('IHDR'), ...be32(width), ...be32(height), 8, 6, 0, 0, 0])
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0])
}

function webp(fourCC: string, chunk: number[]): Uint8Array {
  return Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(fourCC), chunk.length, 0, 0, 0, ...chunk])
}

const lossy = (w: number, h: number) => webp('VP8 ', [0, 0, 0, 0x9D, 0x01, 0x2A, w & 255, w >> 8, h & 255, h >> 8])
function lossless(w: number, h: number) {
  const bits = (w - 1) | ((h - 1) << 14)
  return webp('VP8L', [0x2F, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255])
}
const extended = (w: number, h: number) => webp('VP8X', [0, 0, 0, 0, (w - 1) & 255, (w - 1) >> 8, 0, (h - 1) & 255, (h - 1) >> 8, 0])

function read(bytes: Uint8Array, hash = sha256(bytes)) {
  return readWidgetImage(base64(bytes), hash)
}

describe('readWidgetImage', () => {
  it.each([
    ['PNG', png(10, 20), 'image/png'],
    ['JPEG', jpeg(10, 20), 'image/jpeg'],
    ['lossy WebP', lossy(10, 20), 'image/webp'],
    ['lossless WebP', lossless(10, 20), 'image/webp'],
    ['extended WebP', extended(10, 20), 'image/webp'],
  ])('accepts %s and gives it back as a data URI', (_name, bytes, type) => {
    expect(read(bytes)).toEqual({ ok: true, value: `data:${type};base64,${base64(bytes)}` })
  })

  it.each([
    ['PNG', png],
    ['JPEG', jpeg],
    ['lossy WebP', lossy],
    ['lossless WebP', lossless],
    ['extended WebP', extended],
  ])('refuses %s larger than the limit on either side', (_name, make) => {
    expect(read(make(WIDGET_LIMITS.imagePixels, WIDGET_LIMITS.imagePixels)).ok).toBe(true)
    expect(read(make(WIDGET_LIMITS.imagePixels + 1, 10)).ok).toBe(false)
    expect(read(make(10, WIDGET_LIMITS.imagePixels + 1)).ok).toBe(false)
  })

  it('refuses bytes that are not what the file pinned', () => {
    expect(read(png(10, 20), 'a'.repeat(64))).toMatchObject({ ok: false, error: expect.stringContaining('hash') })
  })

  it.each([
    ['an SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a GIF', new TextEncoder().encode('GIF89a..........')],
    ['a cut-off PNG', png(10, 20).slice(0, 20)],
    ['a cut-off JPEG', jpeg(10, 20).slice(0, 10)],
    ['an empty file', new Uint8Array()],
  ])('refuses %s', (_name, bytes) => {
    expect(read(bytes).ok).toBe(false)
  })

  it('refuses a file over the size limit before hashing it', () => {
    const big = new Uint8Array(WIDGET_LIMITS.imageBytes + 1)
    big.set(png(10, 20))
    expect(read(big)).toMatchObject({ ok: false, error: expect.stringContaining('bytes') })
  })

  it('refuses text that is not base64', () => {
    expect(readWidgetImage('%%%', 'a'.repeat(64)).ok).toBe(false)
  })
})
