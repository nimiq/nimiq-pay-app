import type { KeyPair, Signature } from '@nimiq/core'
import JSEncrypt from 'jsencrypt'
import { JSEncryptRSAKey } from 'jsencrypt/lib/JSEncryptRSAKey'
import { RSAKey } from 'jsencrypt/lib/lib/jsbn/rsa'
import jsSHA from 'jssha'
import { useLogger } from '@/composables/useLogger'
import { useIssuerRestApi } from '@/lib/issuer-rest-api'

const logger = useLogger('IssuerUtils')

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
  logger.log('Generated RSA key')
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

export async function getDecryptedNakaCardData(sourceId: string): Promise<{ pan: string, expiry: string, cvc: string } | undefined> {
  logger.log('Getting decrypted Naka card data')
  const { publicKey: rsaPublicKey, privateKey: rsaPrivateKey } = await generateRsaKey()
  const { cypher: cardCypher } = await useIssuerRestApi().getSecretData(sourceId, rsaPublicKey)
  if (!cardCypher) {
    logger.error('Failed to get secret data for Naka card', { sourceId })
    return
  }
  const decryptedCardPlain = await decryptRsa(cardCypher, rsaPrivateKey)
  if (!decryptedCardPlain) {
    logger.error('Failed to decrypt Naka card data', { sourceId })
    return
  }

  const decryptedCard = JSON.parse(decryptedCardPlain) as {
    Pan: string
    ExpiryDate: string
    Cvc2: string
  }

  return { pan: decryptedCard.Pan, expiry: decryptedCard.ExpiryDate, cvc: decryptedCard.Cvc2 }
}
