import type { Interface } from 'ethers'
import { getAddress, zeroPadValue } from 'ethers'

/**
 * Gets a required event from an ABI interface, throwing if it doesn't exist.
 */
export function getRequiredContractEvent(iface: Interface, name: string) {
  const event = iface.getEvent(name)
  if (!event)
    throw new Error(`Missing contract event: ${name}`)
  return event
}

/**
 * Converts an Ethereum address into a 32-byte zero-padded EVM log topic.
 */
export function toAddressTopic(address: string) {
  return zeroPadValue(getAddress(address), 32)
}
