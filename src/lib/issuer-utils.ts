import type { KeyPair, Signature } from '@nimiq/core'
import jsSHA from 'jssha'

export async function signMessage(localWallet: KeyPair, message: string): Promise<Signature> {
  const payload = `\x16Nimiq Signed Message:\n${message.length}${message}`
  // eslint-disable-next-line new-cap
  const hash = new jsSHA('SHA-256', 'TEXT', { encoding: 'UTF8' }).update(payload).getHash('UINT8ARRAY')
  return localWallet.sign(hash)
}
