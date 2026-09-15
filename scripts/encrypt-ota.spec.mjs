import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { constants, createDecipheriv, createHash, generateKeyPairSync, publicDecrypt } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/encrypt-ota.mjs')
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})
const bundle = Buffer.from('PK\x03\x04 OTA bundle bytes with a visible test marker')
let directory

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'encrypt-ota-'))
  writeFileSync(join(directory, '.capgo_key_v2.pub'), keys.publicKey)
  writeFileSync(join(directory, 'bundle.zip'), bundle)
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('ota encryption', () => {
  it('produces the RSA-2048 / AES-128-CBC format expected by Capgo', () => {
    const results = []
    for (const filename of ['first.zip', 'second.zip']) {
      const result = spawnSync(process.execPath, [script, 'bundle.zip', filename], {
        cwd: directory,
        env: { CAPGO_PRIVATE_KEY: keys.privateKey },
        encoding: 'utf8',
      })
      expect(result.status, result.stderr).toBe(0)
      const metadata = JSON.parse(result.stdout)
      const encrypted = readFileSync(join(directory, filename))
      const [iv, signedKey] = metadata.session_key.split(':')
      const sessionKey = publicDecrypt({ key: keys.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signedKey, 'base64'))
      const decipher = createDecipheriv('aes-128-cbc', sessionKey, Buffer.from(iv, 'base64'))
      expect(Buffer.concat([decipher.update(encrypted), decipher.final()])).toEqual(bundle)
      expect(metadata.checksum).toMatch(/^[0-9a-f]{512}$/)
      const signedChecksum = publicDecrypt({ key: keys.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(metadata.checksum, 'hex'))
      expect(signedChecksum).toEqual(createHash('sha256').update(bundle).digest())
      expect(metadata.upload_sha256).toBe(createHash('sha256').update(encrypted).digest('hex'))
      expect(result.stdout).not.toContain(keys.privateKey)
      results.push({ metadata, encrypted })
    }
    expect(results[0].metadata.session_key).not.toBe(results[1].metadata.session_key)
    expect(results[0].encrypted.equals(results[1].encrypted)).toBe(false)
  })

  it('rejects a private key that does not match the native public key', () => {
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    writeFileSync(join(directory, '.capgo_key_v2.pub'), otherKey.export({ type: 'pkcs1', format: 'pem' }))
    const result = spawnSync(process.execPath, [script, 'bundle.zip', 'encrypted.zip'], {
      cwd: directory,
      env: { CAPGO_PRIVATE_KEY: keys.privateKey },
      encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('does not match')
    expect(existsSync(join(directory, 'encrypted.zip'))).toBe(false)
  })

  it('fails before producing an artifact when the signing key is absent', () => {
    const result = spawnSync(process.execPath, [script, 'bundle.zip', 'encrypted.zip'], {
      cwd: directory,
      env: {},
      encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('CAPGO_PRIVATE_KEY is missing')
    expect(existsSync(join(directory, 'encrypted.zip'))).toBe(false)
  })
})
