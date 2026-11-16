import { beforeAll, describe, expect, it } from 'vitest'
import { buildLocalStakingSignal } from './staking-signal'

beforeAll(async () => {
  // The app provides Nimiq as a global (src/types/nimiq.d.ts); the Node build of the same package is used here.
  (globalThis as any).Nimiq = await import('@nimiq/core')
})

describe('buildLocalStakingSignal', () => {
  const cases: Array<[string, () => Uint8Array]> = [
    ['retire-stake', () => Nimiq.StakingDataBuilder.retireStake(100000n)],
    ['set-active-stake', () => Nimiq.StakingDataBuilder.setActiveStake(0n)],
    ['update-staker', () => Nimiq.StakingDataBuilder.updateStaker(Nimiq.KeyPair.generate().toAddress(), false)],
  ]

  it.each(cases)('%s from the local wallet verifies', (_, data) => {
    const keyPair = Nimiq.KeyPair.generate()
    const tx = buildLocalStakingSignal({ keyPair, data: data(), fee: 0n, validityStartHeight: 67080234, networkId: 24 })
    expect(() => tx.verify(Nimiq.Policy.MAX_SUPPORTED_VERSION, 24)).not.toThrow()
    expect(tx.sender.toUserFriendlyAddress()).toBe(keyPair.toAddress().toUserFriendlyAddress())
    expect(tx.value).toBe(0n)
  })

  it('a hand-set inner proof before sign() is invalid (regression of the first fork build)', () => {
    const keyPair = Nimiq.KeyPair.generate()
    const tx = new Nimiq.Transaction(keyPair.toAddress(), Nimiq.AccountType.Basic, new Uint8Array(0), Nimiq.Address.fromString(Nimiq.Policy.STAKING_CONTRACT_ADDRESS), Nimiq.AccountType.Staking, Nimiq.StakingDataBuilder.retireStake(100000n), 0n, 0n, 0b10, 67080234, 24)
    const inner = Nimiq.Signature.create(keyPair.privateKey, keyPair.publicKey, tx.serializeContent())
    tx.data = Nimiq.StakingDataBuilder.setProof(tx.data, Nimiq.SignatureProof.singleSig(keyPair.publicKey, inner))
    tx.sign(keyPair, undefined)
    expect(() => tx.verify(Nimiq.Policy.MAX_SUPPORTED_VERSION, 24)).toThrow()
  })
})
