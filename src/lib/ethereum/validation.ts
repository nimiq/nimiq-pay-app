import { getAddress, isAddress } from 'ethers'

export function isValidEthAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  return isAddress(address)
}

export function addressesEqual(address1: string, address2: string): boolean {
  try {
    return getAddress(address1) === getAddress(address2)
  }
  catch {
    const isHexAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)

    if (!isHexAddress(address1) || !isHexAddress(address2))
      return false

    return address1.toLowerCase() === address2.toLowerCase()
  }
}

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
