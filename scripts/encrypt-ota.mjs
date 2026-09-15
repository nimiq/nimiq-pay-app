import { Buffer } from 'node:buffer'
import { constants, createCipheriv, createHash, createPrivateKey, createPublicKey, privateEncrypt, randomBytes } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const [input, output] = process.argv.slice(2)
if (!input || !output)
  throw new Error('Usage: node scripts/encrypt-ota.mjs <input.zip> <output.zip>')
if (!process.env.CAPGO_PRIVATE_KEY)
  throw new Error('CAPGO_PRIVATE_KEY is missing')

const privateKey = createPrivateKey(process.env.CAPGO_PRIVATE_KEY)
delete process.env.CAPGO_PRIVATE_KEY
if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails?.modulusLength !== 2048)
  throw new Error('Capgo requires an RSA-2048 signing key')

const publicKey = createPublicKey(readFileSync('.capgo_key_v2.pub'))
if (!createPublicKey(privateKey).equals(publicKey))
  throw new Error('Signing key does not match .capgo_key_v2.pub')
if (!lstatSync(input).isFile())
  throw new Error('OTA input must be a regular file')

const bundle = readFileSync(input)
if (!bundle.length)
  throw new Error('OTA bundle is empty')

// Match Capgo CLI 8.51's wire format without installing its dependencies on the signing runner.
const sessionKey = randomBytes(16)
const iv = randomBytes(16)
const cipher = createCipheriv('aes-128-cbc', sessionKey, iv)
const encrypted = Buffer.concat([cipher.update(bundle), cipher.final()])
const signingOptions = { key: privateKey, padding: constants.RSA_PKCS1_PADDING }
const checksum = privateEncrypt(signingOptions, createHash('sha256').update(bundle).digest()).toString('hex')
const signedSessionKey = privateEncrypt(signingOptions, sessionKey).toString('base64')

writeFileSync(output, encrypted, { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({
  checksum,
  session_key: `${iv.toString('base64')}:${signedSessionKey}`,
  upload_sha256: createHash('sha256').update(encrypted).digest('hex'),
}))
