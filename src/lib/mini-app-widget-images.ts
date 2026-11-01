import { sha256HexOfBytes } from '@/lib/crypto'
import { WIDGET_LIMITS } from '@/lib/mini-app-widgets'

interface ImageFormat { type: 'image/png' | 'image/jpeg' | 'image/webp', width: number, height: number }

function matches(bytes: Uint8Array, at: number, expected: number[]): boolean {
  return expected.every((byte, i) => bytes[at + i] === byte)
}

function ascii(text: string): number[] {
  return [...text].map(c => c.charCodeAt(0))
}

function pngFormat(bytes: Uint8Array, view: DataView): ImageFormat | undefined {
  if (bytes.length < 24 || !matches(bytes, 12, ascii('IHDR')))
    return undefined
  return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) }
}

function jpegFormat(bytes: Uint8Array, view: DataView): ImageFormat | undefined {
  let i = 2
  while (i + 9 <= bytes.length && bytes[i] === 0xFF) {
    const marker = bytes[i + 1]!
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC)
      return { type: 'image/jpeg', width: view.getUint16(i + 7), height: view.getUint16(i + 5) }
    i += 2 + view.getUint16(i + 2)
  }
  return undefined
}

function webpFormat(bytes: Uint8Array, view: DataView): ImageFormat | undefined {
  if (bytes.length < 25)
    return undefined
  if (bytes.length >= 30 && matches(bytes, 12, ascii('VP8 ')) && matches(bytes, 23, [0x9D, 0x01, 0x2A]))
    return { type: 'image/webp', width: view.getUint16(26, true) & 0x3FFF, height: view.getUint16(28, true) & 0x3FFF }
  if (matches(bytes, 12, ascii('VP8L')) && bytes[20] === 0x2F) {
    const bits = view.getUint32(21, true)
    return { type: 'image/webp', width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 }
  }
  if (bytes.length >= 30 && matches(bytes, 12, ascii('VP8X')))
    return { type: 'image/webp', width: view.getUint16(24, true) + (bytes[26]! << 16) + 1, height: view.getUint16(27, true) + (bytes[29]! << 16) + 1 }
  return undefined
}

function imageFormat(bytes: Uint8Array): ImageFormat | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (matches(bytes, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    return pngFormat(bytes, view)
  if (matches(bytes, 0, [0xFF, 0xD8]))
    return jpegFormat(bytes, view)
  if (matches(bytes, 0, ascii('RIFF')) && matches(bytes, 8, ascii('WEBP')))
    return webpFormat(bytes, view)
  return undefined
}

/** From the bytes rather than what the server calls them: only these three formats, which cannot run anything, reach the app. */
export function readWidgetImage(base64: string, sha256: string): { ok: true, value: string } | { ok: false, error: string } {
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  }
  catch {
    return { ok: false, error: 'the image is not base64' }
  }
  if (bytes.length > WIDGET_LIMITS.imageBytes)
    return { ok: false, error: `the image is larger than ${WIDGET_LIMITS.imageBytes} bytes` }
  if (sha256HexOfBytes(bytes) !== sha256)
    return { ok: false, error: `the image does not match its hash ${sha256}` }
  const format = imageFormat(bytes)
  if (!format)
    return { ok: false, error: 'the image is not a PNG, JPEG or WebP' }
  const { type, width, height } = format
  if (!width || !height || width > WIDGET_LIMITS.imagePixels || height > WIDGET_LIMITS.imagePixels)
    return { ok: false, error: `the image is ${width} × ${height}, at most ${WIDGET_LIMITS.imagePixels} × ${WIDGET_LIMITS.imagePixels} is allowed` }
  return { ok: true, value: `data:${type};base64,${base64.replace(/\s/g, '')}` }
}
