import type { KeyPair, Signature } from '@nimiq/core'
import JSEncrypt from 'jsencrypt'
import { JSEncryptRSAKey } from 'jsencrypt/lib/JSEncryptRSAKey'
import { RSAKey } from 'jsencrypt/lib/lib/jsbn/rsa'
import jsSHA from 'jssha'

export async function signMessage(localWallet: KeyPair, message: string): Promise<Signature> {
  const payload = `\x16Nimiq Signed Message:\n${message.length}${message}`
  // eslint-disable-next-line new-cap
  const hash = new jsSHA('SHA-256', 'TEXT', { encoding: 'UTF8' }).update(payload).getHash('UINT8ARRAY')
  return localWallet.sign(hash)
}

export async function generateRsaKey() {
  const base = new RSAKey()
  await new Promise<void>(res =>
    base.generateAsync(1024, (65537).toString(16), res),
  )
  console.log('Generated RSA key')
  // @ts-expect-error Obj type is also expected even though it is not defined in the type
  const key = new JSEncryptRSAKey(base)
  return { publicKey: key.getPublicBaseKeyB64(), privateKey: key.getPrivateBaseKeyB64() }
}

export async function decryptRsa(cypher: string, KEY: string) {
  const key = new JSEncrypt()
  key.setPrivateKey(KEY)
  const plain = key.decrypt(cypher)
  return plain
}
