import type { Interface } from 'ethers'
import { getAddress, zeroPadValue } from 'ethers'

export function getRequiredContractEvent(iface: Interface, name: string) {
  const event = iface.getEvent(name)
  if (!event)
    throw new Error(`Missing contract event: ${name}`)
  return event
}

export function toAddressTopic(address: string) {
  return zeroPadValue(getAddress(address), 32)
}
