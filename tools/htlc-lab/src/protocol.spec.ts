import * as N from '@nimiq/core'
import { describe, expect, it } from 'vitest'
import { createHtlc, createSpam, formatNim, importWallet, parseLuna, parseNim, validateNetwork } from './protocol'

const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('wallet and transaction protocol', () => {
  it('matches the app entropy derivation exactly', () => {
    N.Entropy.SIZE = 16
    const expected = N.KeyPair.derive(N.MnemonicUtils.mnemonicToEntropy(words.split(' ')).toExtendedPrivateKey().derivePath('m/44\'/242\'/0\'/0\'').privateKey)
    expect(importWallet(words).toAddress().equals(expected.toAddress())).toBe(true)
    expect(() => importWallet('abandon '.repeat(12))).toThrow()
    expect(() => importWallet('abandon')).toThrow()
  })

  it('rejects unsafe amounts and mismatched networks', () => {
    expect(parseLuna('1', false)).toBe(1)
    expect(() => parseLuna('0.1')).toThrow()
    expect(() => parseLuna('-1')).toThrow()
    expect(() => parseLuna('9007199254740992')).toThrow()
    expect(() => validateNetwork('testnet', 5, 'mainalbatross')).toThrow()
    expect(() => validateNetwork('mainnet', 6, 'testalbatross')).toThrow()
    expect(() => validateNetwork('testnet', 5, 'testalbatross')).not.toThrow()
    expect(() => validateNetwork('mainnet', 24, 'MainAlbatross')).not.toThrow()
  })

  it('creates different valid contract addresses and signed 1 Luna transfers', () => {
    const owner = importWallet(words)
    const args = { owner, publicKey: owner.publicKey.toHex(), value: 100, fee: 0, height: 1000, networkId: 5, expiry: 2000000000000 }
    const a = createHtlc(args)
    const b = createHtlc({ ...args, expiry: args.expiry + 1 })
    expect(a.recipient.equals(b.recipient)).toBe(false)
    expect(a.verify(5)).toBeUndefined()
    const recipient = N.KeyPair.generate().toAddress().toUserFriendlyAddress()
    const first = createSpam(owner, recipient, 'run-1', 0, 0, 1000, 5)
    const second = createSpam(owner, recipient, 'run-1', 1, 0, 1000, 5)
    expect(first.value).toBe(1n)
    expect(first.hash()).not.toBe(second.hash())
    expect(first.verify(5)).toBeUndefined()
  })
})

describe('deposit NIM amounts', () => {
  it('converts decimal NIM exactly to whole Luna', () => {
    expect(parseNim('0.00001')).toBe(1)
    expect(formatNim(1)).toBe('0.00001')
    expect(formatNim(123456)).toBe('1.23456')
    expect(parseNim('1.23456')).toBe(123456)
    expect(parseNim('0.29')).toBe(29000)
    for (const input of ['0', '-1', '0.000001', '1e3', '9007199254740992'])
      expect(() => parseNim(input)).toThrow()
  })
})
