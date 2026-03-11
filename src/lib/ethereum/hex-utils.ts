/**
 * Safely converts a hexadecimal string to a Uint8Array.
 * Handles edge cases like empty strings, odd-length hex, and invalid characters.
 *
 * @param hex - The hex string to convert (with or without 0x prefix)
 * @returns Uint8Array of bytes, or empty array if input is invalid
 */
export function hexToBytes(hex: string): Uint8Array {
  if (!hex || typeof hex !== 'string') {
    return new Uint8Array(0)
  }

  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex

  // Handle empty string after prefix removal
  if (cleanHex.length === 0) {
    return new Uint8Array(0)
  }

  // Validate hex characters
  if (!/^[\da-f]*$/i.test(cleanHex)) {
    return new Uint8Array(0)
  }

  // Pad with leading zero if odd length
  const paddedHex = cleanHex.length % 2 === 1 ? `0${cleanHex}` : cleanHex

  // Match pairs and convert - regex always matches non-empty valid hex
  const matches = paddedHex.match(/.{2}/g) ?? []
  return new Uint8Array(matches.map(byte => Number.parseInt(byte, 16)))
}

/**
 * Converts bytes to a hexadecimal string.
 *
 * @param bytes - The bytes to convert
 * @param prefix - Whether to include 0x prefix (default: true)
 * @returns Hexadecimal string representation
 */
export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return prefix ? `0x${hex}` : hex
}

/**
 * Checks if a string is a valid hex string.
 *
 * @param value - The string to check
 * @returns True if the string is valid hex
 */
export function isValidHex(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value
  return cleanHex.length > 0 && /^[\da-f]*$/i.test(cleanHex)
}
