export function hexToBytes(hex: string): Uint8Array {
  if (!hex || typeof hex !== 'string') {
    return new Uint8Array(0)
  }

  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex

  if (cleanHex.length === 0) {
    return new Uint8Array(0)
  }

  if (!/^[\da-f]*$/i.test(cleanHex)) {
    return new Uint8Array(0)
  }

  const paddedHex = cleanHex.length % 2 === 1 ? `0${cleanHex}` : cleanHex

  const matches = paddedHex.match(/.{2}/g) ?? []
  return new Uint8Array(matches.map(byte => Number.parseInt(byte, 16)))
}

export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return prefix ? `0x${hex}` : hex
}

export function isValidHex(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value
  return cleanHex.length > 0 && /^[\da-f]*$/i.test(cleanHex)
}
