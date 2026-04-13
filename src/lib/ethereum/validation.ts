import { getAddress, isAddress } from 'ethers'

/**
 * Validates an Ethereum address using EIP-55 checksum validation.
 *
 * @param address - The address to validate
 * @returns True if the address is valid
 */
export function isValidEthAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  return isAddress(address)
}

/**
 * Compares two Ethereum addresses for equality using EIP-55 normalization.
 *
 * @param address1 - First address
 * @param address2 - Second address
 * @returns True if addresses are equal
 */
export function addressesEqual(address1: string, address2: string): boolean {
  try {
    // getAddress normalizes to checksummed format, making comparison reliable
    return getAddress(address1) === getAddress(address2)
  }
  catch {
    const isHexAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)

    if (!isHexAddress(address1) || !isHexAddress(address2))
      return false

    // Older locally stored addresses might not be EIP-55-normalized.
    return address1.toLowerCase() === address2.toLowerCase()
  }
}

/**
 * Validates a chain ID value.
 *
 * @param chainId - The chain ID to validate (number or hex string)
 * @returns The numeric chain ID, or null if invalid
 */
export function parseChainId(chainId: unknown): number | null {
  if (chainId === undefined || chainId === null) {
    return null
  }

  if (typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0) {
    return chainId
  }

  if (typeof chainId === 'string') {
    const trimmed = chainId.trim()
    if (trimmed.length === 0) {
      return null
    }
    const parsed = trimmed.startsWith('0x')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}
