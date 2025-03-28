import type { KeyPair, Signature } from '@nimiq/core'

export async function signMessage(localWallet: KeyPair, message: string): Promise<Signature> {
  const payload = `\x16Nimiq Signed Message:\n${message.length}${message}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return localWallet.sign(new Uint8Array(hash))
}
