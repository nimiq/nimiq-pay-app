import type { KeyPair, Transaction } from '@nimiq/core'

/**
 * Builds and signs a staking signalling transaction (set-active-stake, retire-stake, update-staker: value 0) sent
 * from the local wallet, which is also the staker.
 *
 * For a signalling transaction from a basic account, `Transaction.sign(keyPair)` already fills the staker's inner
 * proof in the data before signing the content; setting that proof by hand first makes the outer signature invalid.
 * The transaction is verified before it is returned, so an invalid one is never sent (it would only stay "pending").
 */
export function buildLocalStakingSignal(args: {
  keyPair: KeyPair
  data: Uint8Array
  fee: bigint
  validityStartHeight: number
  networkId: number
}): Transaction {
  const tx = new Nimiq.Transaction(
    /* sender */ args.keyPair.toAddress(),
    /* senderType */ Nimiq.AccountType.Basic,
    /* senderData */ new Uint8Array(0),
    /* recipient */ Nimiq.Address.fromString(Nimiq.Policy.STAKING_CONTRACT_ADDRESS),
    /* recipientType */ Nimiq.AccountType.Staking,
    /* recipientData */ args.data,
    /* value */ 0n,
    /* fee */ args.fee,
    /* flags */ 0b10,
    /* validityStartHeight */ args.validityStartHeight,
    /* networkId */ args.networkId,
  )
  tx.sign(args.keyPair, undefined)
  tx.verify(Nimiq.Policy.MAX_SUPPORTED_VERSION, args.networkId) // throws on an invalid proof
  return tx
}
