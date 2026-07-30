# Mini App HTLC transactions in the transaction history

Date: 2026-07-30
Branch: `mini-app-htlcs`
Origin: review comment on `src/types/transactions.ts:159`

## Problem

The branch adds `Transfer.HTLC` so Mini Apps can create and redeem HTLCs. Unlike the app's own
remote-signer HTLCs — which are internal and deliberately hidden — these transactions must appear in
the user's history. They currently do not, and worse, they get rewritten into the wrong kind.

The review comment names three fixes. They are necessary but not sufficient; the same root cause has
three further consequences on this branch.

### Root cause chain

`_sendTx` writes the `Transfer.HTLC` row to SQLite correctly (`src/stores/transactions.ts:300`).
Everything downstream then ignores or clobbers it:

1. `isExternalTx` (`src/types/transactions.ts:397`) omits `Transfer.HTLC`, so the just-sent tx never
   enters the in-memory `transactions` list. Nothing appears until a reload.
2. All four filtered read queries omit `htlc` from their `transfer IN (...)` list —
   `SelectPaginationTransactions` (`sql-queries.ts:34`), `SelectPaginationTransactionsByAsset:35`,
   `SelectAllTransactions:36` and `SelectTransactionsByAsset:54`. Only the first was named in the
   review. The other three matter beyond display: `SelectTransactionsByAsset` feeds `refreshFromDb`,
   which is what populates the list after a login, and `SelectAllTransactions` feeds the `seenHashes`
   dedup set in `updateTransactionHistory:207`.
3. Because the stored HTLC row is invisible to `seenHashes`, `filterUnseen` does not drop it.
   `categorizeTransactions` sees `recipientType === 'htlc'` with a non-zero `hashRoot`, files it under
   `htlcSwapTxs`, and `handleSwapTxs` asks Fastspot about a contract Fastspot has never heard of. The
   lookup throws, the catch calls `addUnknownPaymentToMerchantTransaction`, and the resulting
   `INSERT OR REPLACE` **overwrites the HTLC row with a `Payment`**. This is the symptom the review
   describes.

### Further consequences of the same cause

- **Redeems get overwritten as "Top-Up".** A redeem lands on the local address, so both
  `handleIncomingTransaction` (`sync/lifecycle.ts:172`) and the local-account loop
  (`sync/transactions.ts:138`) pick it up. Both dedup only against `GetAllUserReceipts`, so the stored
  `htlc` row is invisible to them and `buildTopUpReceipt` overwrites it as a `UserReceipt`.
- **Mini App HTLCs get registered as our own remote signers.** `PlainHtlcTimeoutResolveProof.creator`
  is the HTLC's *sender*, and `sendNewHtlcTransaction` defaults `htlcSender` to the local address. A
  Mini App redeem-timeout or redeem-early therefore satisfies `isOwnHtlcDrain`: the transaction is
  silently dropped from history *and* `registerOwnHtlcIfMissing` inserts the Mini App contract into
  `remote_signers` (`lifecycle.ts:191`, `sync/transactions.ts:136`).
- **Redeems debit the remote balance.** `transactions.ts:313` subtracts `tx.amount` from
  `remoteBalance` for every transfer that is not `LocalToRemote`/`ExtendRemote`. Correct for the
  `new-htlc` funding tx, which really is drawn from our remote HTLC; wrong for all three redeem types,
  which drain a foreign contract.

## Design

### 1. Types — `src/types/transactions.ts`

Add `HtlcTransaction` to the `ExternalTransactionSentByUser` union and `Transfer.HTLC` to
`isExternalTx`. This mirrors exactly how `StakingTransaction` is wired, which is the precedent for
"a new transfer type that is neither a payment nor an internal sync tx".

Effect: `_sendTx:302` pushes the tx into the in-memory list immediately, and every component typed
against `ExternalTransaction` accepts it.

### 2. Reads — `src/lib/sql-queries.ts`

Add `Transfer.HTLC` to all four filtered queries. Read-only change; the `transfer` column already
exists, so no migration (see the additive-migrations rule in `CLAUDE.md`).

`SelectAllTransactions` is the one that stops the overwrite: once HTLC rows are visible to
`seenHashes`, `filterUnseen` drops already-stored HTLC transactions before they ever reach
`handleSwapTxs`.

### 3. Own-HTLC identification — `src/stores/remote-signer.ts`, `src/stores/sync/transactions.ts`

Identify our own HTLCs positively by their full contract shape, rather than trying to identify Mini
App HTLCs by heuristic. `createDepositData` (`src/lib/tx.ts:544`) pins every field:

```
isOwnRemoteHtlc(c) =
     c.sender    === localAddress
  && c.recipient === cosignerAddress   // PublicKey.fromHex(remotePublicKey).toAddress()
  && c.hashRoot  === '00'.repeat(32)
  && c.hashCount === 1
```

`hashAlgorithm` is deliberately **not** part of the match.

Why this is safe even if a Mini App picks an all-zero `hashRoot`: to survive the match, the Mini App
HTLC would also need `recipient` = our cosigner address. Such a contract is early-resolvable only by
the cosigner and timeout-resolvable by the local wallet — it *is* an app-controlled HTLC. Misfiling it
as our own costs a history label, never funds. Every other shape (a real hashRoot, or a real
counterparty as recipient) is correctly rejected.

Applied in three places:

- `categorizeTransactions:173` — tighten the extension test from `hashRoot === 0` to the full shape.
  `tx.data` is already a `PlainHtlcData` carrying all four fields, so this costs no extra call. Mini
  App HTLCs stop entering the extension-traversal bucket.
- `registerOwnHtlcIfMissing` — it already calls `getAccount`; check the shape of the returned
  `PlainHtlcContract` before registering. When the contract is pruned (fully drained, so `getAccount`
  returns nothing), resolve the shape from its creation transaction via a history lookup on the HTLC
  address — history is permanent, so this works indefinitely — then cache the outcome by registering.
- `isOwnHtlcDrain` callers stop swallowing Mini App redeems and stop polluting `remote_signers`.

### 4. Write paths

- `handleSwapTxs` — when the Fastspot *lookup itself* fails, record `Transfer.HTLC` with title
  `'New HTLC'` through a new `addHtlcTransaction` (mirroring `addStakingtransaction`). Keep the
  existing `Payment` fallback for contracts Fastspot *does* know but whose asset pair we cannot
  handle: those are real swaps and should not be relabelled.
- `handleIncomingTransaction` (`sync/lifecycle.ts:181`) and the local-account loop
  (`sync/transactions.ts:125`) dedup against `SelectAllTransactions` instead of `GetAllUserReceipts`,
  so a stored HTLC redeem is no longer overwritten as a Top-Up. `SelectAllTransactions` covers every
  displayable transfer including `htlc` after change 2, and keeps this to one query rather than one
  `GetTransactionByHash` per transaction. `sync/transactions.ts:164` keeps its separate
  `GetAllUserReceipts` fetch, which genuinely needs receipts only, for `topUpAddresses`.

### 5. Remote balance — `src/stores/transactions.ts:313`

Debit `remoteBalance` only when `partialTx.htlcData.type === 'new-htlc'`. The check must read
`partialTx`, not the built `tx`, because `HtlcTransaction` does not declare `htlcData`.

### 6. List and detail appearance

Redeems pay the user, so they must read as incoming. Fundings must not borrow the withdrawal icon:
a funding is not a withdrawal, and reusing that icon would conflate it with the remote-HTLC →
external-address withdrawals already handled at `TransactionItem.vue:43`. Fundings keep the default
`MerchantCategory.Shop` icon; their `New HTLC` title carries the meaning.

A redeem is only incoming when it actually pays us — a Mini App may name any recipient. Share one
predicate between the two call sites, taking the local address as an explicit parameter so
`src/types/transactions.ts` keeps its store-free layering. `isOwnHtlcDrain`
(`sync/transactions.ts:34`) is the precedent for that signature.

```ts
// src/types/transactions.ts
export function isHtlcRedeemToSelf(
  tx: Pick<Transaction, 'transfer' | 'senderType' | 'recipient'>,
  localAddress: string,
) {
  return tx.transfer === Transfer.HTLC
    && tx.senderType === Nimiq.AccountType.HTLC
    && tx.recipient === localAddress
}
```

`Nimiq` is a global value binding (`src/types/nimiq.d.ts`), so this needs no new import.

- `TransactionItem.vue:39` — add a `isHtlcRedeemToSelf(tx, …)` branch returning `'deposit'`, placed
  after the existing `'withdraw'` branch. Fundings have `recipientType === HTLC` and fall through to
  the `Shop` default unchanged.
- `TransactionDetails.vue:39` — extend `isIncoming` to `Transfer.UserReceipt || isHtlcRedeemToSelf(…)`.
  This is what makes the detail sheet show the HTLC contract as the counterparty and hide the user's
  own address, matching the comment above that line.

Both call sites read the local address from `useLocalWallet()`.

### 7. Tests

- `src/lib/sql-queries.spec.ts` — assert `Transfer.HTLC` in all four queries, mirroring the existing
  Staking assertions.
- `src/stores/transactions.spec.ts` — an HTLC tx enters the in-memory list; an HTLC row survives a
  same-hash Top-Up write.
- `src/stores/sync/transactions.spec.ts` — a Fastspot lookup failure yields `Transfer.HTLC`; an HTLC
  with a zero `hashRoot` but a foreign recipient is rejected from the extension bucket.
- `src/stores/remote-signer.spec.ts` — `registerOwnHtlcIfMissing` skips non-matching shapes and
  resolves a pruned contract via its creation transaction.
- `src/components/TransactionItem.spec.ts` — a redeem paying the local address gets the `'deposit'`
  icon; a redeem naming a third party and a funding both keep the `Shop` default.
- `src/components/TransactionDetails.spec.ts` — `isIncoming` is true for a redeem paying the local
  address and false for one naming a third party.

## Deliberately out of scope

### Limitation: after a DB wipe, Mini App redeems re-appear as "Top-Up"

This is understood and accepted, not overlooked. It is not a regression: it describes behaviour no
worse than what ships on `main` today.

A redeem paying the local address is, on-chain, indistinguishable from any other HTLC paying us — a
Fastspot swap payout, or another Nimiq Pay user. The only thing that identifies it as a Mini App
redeem is the local `Transfer.HTLC` row written when we sent it. After a reinstall or a
`clearTxHistory`, that row is gone and the redeem is re-recorded as a Top-Up.

The creation row *is* recovered from chain — the remote-signer scan re-discovers the funding tx and,
with the `handleSwapTxs` fix above, re-records it as `Transfer.HTLC`. But in
`updateTransactionHistory` the local-account loop runs at line 138, **before** the remote-signer scan
at line 228, so on the first pass after a wipe the creation row does not exist yet when the redeem is
processed. A second refresh cannot repair it either: by then the redeem has been written as a Top-Up
and the dedup skips it.

The fix is to reorder those two blocks so the remote-signer scan populates HTLC rows before the local
loop consumes them. That reorder touches the sequencing of the whole history refresh and deserves its
own change with its own tests, so it is excluded here.

Consequences of leaving it are narrow. The redeem is still present with the correct amount, timestamp
and counterparty, and it still renders as an incoming deposit — a `UserReceipt` already yields the
`'deposit'` icon and `isIncoming`, so section 6's treatment is unaffected. Only the title differs:
"Top-Up" instead of "Redeem HTLC (…)", and only for users who wiped their database after using a Mini
App HTLC.
