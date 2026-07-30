# Mini App HTLC Transaction History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mini App HTLC transactions appear in the user's transaction history as HTLC transactions, instead of being invisible, relabelled as "Payment"/"Top-Up", or silently swallowed as internal remote-signer traffic.

**Architecture:** `Transfer.HTLC` becomes a first-class *external* transfer, exactly the way `Transfer.Staking` already is — added to the `ExternalTransactionSentByUser` union, to `isExternalTx`, and to the four filtered SQL reads. The sync paths that currently overwrite those rows are taught to recognise them, and the app's own remote-signer HTLCs are identified positively by their full contract shape rather than by a single `hashRoot` field, so Mini App contracts stop being mistaken for our own.

**Tech Stack:** Vue 3 + TypeScript, Pinia stores, Vitest + `@vue/test-utils`, SQLite via CapacitorSQLite, `@nimiq/core` (Albatross client).

**Spec:** `docs/superpowers/specs/2026-07-30-mini-app-htlc-transaction-history-design.md`

## Global Constraints

- Package manager is `pnpm`. Never `npm` or `yarn`.
- Run `pnpm lint` and `pnpm typecheck` after any change. Both must pass before a commit.
- Unit tests: `pnpm vitest run <path>` for one file, `pnpm test:unit -- --run` for all. Do not run the full suite after every edit — only before committing a task.
- Never modify an existing `CREATE TABLE` query in `src/lib/sql-queries.ts`. No task here needs a migration: every SQL change is to a `SELECT`, and the `transfer` column already exists.
- Never touch `*.po` files — they are generated. New user-facing strings are picked up by `pnpm i18n:extract`. No task here adds a new string; the four HTLC titles already exist in `src/types/transactions.ts`.
- Always write "Mini Apps" (capitalized, two words) in comments and docs. Never "mini-apps", "miniApps", or "mini apps".
- Comment only complex or non-obvious code, and explain *why*, not *what*.
- Do not add wrapper functions that only forward with fixed arguments. Do not add helper functions unless they deduplicate a real second call site. One agreed exception, ruled on before execution: `getHtlcCreationData` in Task 4 is a single-call-site store action, approved because `src/stores/nimiq-network.ts` is already built from single-purpose client wrappers with that exact try/catch shape, and it keeps raw client access out of `remote-signer.ts`. Do not flag it as a redundant helper.
- `Nimiq` is a global value binding declared in `src/types/nimiq.d.ts`. It needs no import in `src/`, but every test file that exercises code touching it must `vi.stubGlobal('Nimiq', …)`.

---

### Task 1: Make `Transfer.HTLC` a first-class external transfer

This is the change the review comment asks for. Two edits: the type-level guard and the SQL reads. They ship together because the guard is what puts a just-sent HTLC transaction into the in-memory list, and the SQL reads are what keep it there across a reload — either alone leaves a visibly half-working feature.

Note that the review named only `SelectPaginationTransactions`. Three sibling queries carry the identical `transfer IN (...)` filter and all four must change. `SelectAllTransactions` is the load-bearing one: it feeds the `seenHashes` dedup set in `updateTransactionHistory`, and until `htlc` is in it, every stored HTLC row gets reprocessed and overwritten on the next history refresh.

**Files:**
- Modify: `src/types/transactions.ts:377` (the `ExternalTransactionSentByUser` union) and `src/types/transactions.ts:397-399` (`isExternalTx`)
- Modify: `src/lib/sql-queries.ts:34`, `:35`, `:36`, `:54`
- Test: `src/lib/sql-queries.spec.ts`, `src/stores/transactions.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isExternalTx(tx)` returns `true` for `Transfer.HTLC`; `ExternalTransaction` now includes `HtlcTransaction`, so `transactions.value`, `TransactionItem.vue` and `TransactionDetails.vue` all accept HTLC rows. Tasks 3, 5 and 6 depend on both.

- [ ] **Step 1: Write the failing SQL query tests**

Append these four cases inside the existing `describe('sql transaction query definitions', …)` block in `src/lib/sql-queries.spec.ts`. The file already reads its own source as text and greps it — follow that existing pattern rather than importing the enum.

```ts
  it('includes Mini App HTLC transactions in paginated transaction reads', () => {
    expect(selectPaginationLine).toContain('Transfer.HTLC')
  })

  it('includes Mini App HTLC transactions in asset-specific paginated reads', () => {
    const line = sqlQueriesSource.split('\n').find(l => l.includes('SelectPaginationTransactionsByAsset ='))
    expect(line).toContain('Transfer.HTLC')
  })

  it('includes Mini App HTLC transactions in full transaction reads', () => {
    expect(selectAllLine).toContain('Transfer.HTLC')
  })

  it('includes Mini App HTLC transactions in asset-specific full reads', () => {
    const line = sqlQueriesSource.split('\n').find(l => l.includes('SelectTransactionsByAsset ='))
    expect(line).toContain('Transfer.HTLC')
  })
```

- [ ] **Step 2: Write the failing in-memory list test**

Append this to the end of the `describe('useTransactions', …)` block in `src/stores/transactions.spec.ts`, just before its closing `})`. It is modelled on the existing "does not clear the active remote signer when draining an inactive remote signer" test at line 647 — same `getSignedTx` mock shape, same `signedTx` stub.

```ts
  it('adds a Mini App HTLC transaction to the in-memory list', async () => {
    const { getSignedTx } = await import('@/lib/tx')
    const { useTransactions } = await import('./transactions')
    state.activeAsset = Asset.NIM
    const txPlain = {
      transactionHash: 'htlc-funding-hash',
      sender: state.remoteAddress.toUserFriendlyAddress(),
      senderType: 2,
      recipient: 'NQ55 MINI APP HTLC ADDRESS',
      recipientType: 2,
      value: 500,
      fee: 0,
      timestamp: 1000,
      validityStartHeight: 1,
      data: { raw: '' },
      proof: { raw: '' },
      valid: true,
    }
    vi.mocked(getSignedTx).mockResolvedValue({
      data: {
        signedTx: {
          toPlain: () => txPlain,
          hash: () => txPlain.transactionHash,
          toHex: () => 'serialized-tx',
          serializeContent: () => new Uint8Array(),
          networkId: 5,
          recipientType: 2,
          senderType: 2,
          proof: { length: 98 },
        },
        txSent: true,
      },
      error: undefined,
    } as any)

    const store = useTransactions()
    await store.sendTx({
      transfer: Transfer.HTLC,
      sender: txPlain.sender,
      recipient: txPlain.recipient,
      amount: 500,
      title: 'New HTLC',
      htlcData: { type: 'new-htlc' },
    } as any)

    expect(store.transactions.map(tx => tx.hash)).toContain('htlc-funding-hash')
  })
```

- [ ] **Step 3: Run both test files to verify they fail**

```bash
pnpm vitest run src/lib/sql-queries.spec.ts src/stores/transactions.spec.ts
```

Expected: the four SQL cases fail on `expected '…' to contain 'Transfer.HTLC'`; the list case fails with the received array not containing `'htlc-funding-hash'`.

- [ ] **Step 4: Add `Transfer.HTLC` to the type guard and the union**

In `src/types/transactions.ts`, extend the union at line 377:

```ts
export type ExternalTransactionSentByUser = UserTransaction | MerchantTransaction | StakingTransaction | HtlcTransaction
```

and the guard at line 398:

```ts
export function isExternalTx(tx: Transaction): tx is ExternalTransaction {
  return [Transfer.UserPayment, Transfer.UserPaymentToMerchant, Transfer.UserPaymentToAtomicSwap, Transfer.UserReceipt, Transfer.Staking, Transfer.HTLC].includes(tx.transfer)
}
```

- [ ] **Step 5: Add `Transfer.HTLC` to the four filtered SQL reads**

In `src/lib/sql-queries.ts`, each of `SelectPaginationTransactions` (line 34), `SelectPaginationTransactionsByAsset` (35), `SelectAllTransactions` (36) and `SelectTransactionsByAsset` (54) ends its `transfer IN (...)` list with `\'${Transfer.Staking}\'`. Append `, \'${Transfer.HTLC}\'` to each, keeping the trailing `// eslint-disable-line ts/prefer-literal-enum-member` comment on the line. For example, line 34 becomes:

```
... WHERE transfer IN (\'${Transfer.UserPaymentToMerchant}\', \'${Transfer.UserPaymentToAtomicSwap}\', \'${Transfer.UserPayment}\', \'${Transfer.UserReceipt}\', \'${Transfer.Staking}\', \'${Transfer.HTLC}\') ORDER BY ...
```

Leave `GetAllUserReceipts` (line 37) alone — it deliberately selects only receipts.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm vitest run src/lib/sql-queries.spec.ts src/stores/transactions.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/types/transactions.ts src/lib/sql-queries.ts src/lib/sql-queries.spec.ts src/stores/transactions.spec.ts
git commit -m "Show Mini App HTLC transactions in the transaction history"
```

---

### Task 2: Stop HTLC redeems debiting the remote balance

`_sendTx` debits `remoteBalance` for every transfer that is not `LocalToRemote`/`ExtendRemote`. That is correct for the `new-htlc` funding transaction, which really is drawn from our remote HTLC, and wrong for all three redeem types, which drain a foreign contract and pay the *local* wallet. Left as-is, every Mini App redeem visibly shrinks the home balance until the next sync corrects it.

**Files:**
- Modify: `src/stores/transactions.ts:313`
- Test: `src/stores/transactions.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1; can be done in either order.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

Append to the `describe('useTransactions', …)` block in `src/stores/transactions.spec.ts`. Both cases share a helper so the two assertions stay readable.

```ts
  describe('remote balance on Mini App HTLC transactions', () => {
    async function sendHtlc(htlcType: string, recipient: string, recipientType: number) {
      const { getSignedTx } = await import('@/lib/tx')
      const { useTransactions } = await import('./transactions')
      const txPlain = {
        transactionHash: `htlc-${htlcType}-hash`,
        sender: 'NQ55 MINI APP HTLC ADDRESS',
        senderType: 2,
        recipient,
        recipientType,
        value: 500,
        fee: 0,
        timestamp: 1000,
        validityStartHeight: 1,
        data: { raw: '' },
        proof: { raw: '' },
        valid: true,
      }
      vi.mocked(getSignedTx).mockResolvedValue({
        data: {
          signedTx: {
            toPlain: () => txPlain,
            hash: () => txPlain.transactionHash,
            toHex: () => 'serialized-tx',
            serializeContent: () => new Uint8Array(),
            networkId: 5,
            recipientType,
            senderType: 2,
            proof: { length: 98 },
          },
          txSent: true,
        },
        error: undefined,
      } as any)
      await useTransactions().sendTx({
        transfer: Transfer.HTLC,
        sender: txPlain.sender,
        recipient,
        amount: 500,
        title: 'Redeem HTLC (regular)',
        htlcData: { type: htlcType },
      } as any)
    }

    it('does not debit the remote balance when redeeming a Mini App HTLC', async () => {
      await sendHtlc('redeem-regular', state.localAddress.toUserFriendlyAddress(), 0)
      expect(state.updateActiveRemoteBalance).not.toHaveBeenCalled()
    })

    it('debits the remote balance when funding a new Mini App HTLC', async () => {
      state.remoteBalance = 900
      await sendHtlc('new-htlc', 'NQ55 MINI APP HTLC ADDRESS', 2)
      expect(state.updateActiveRemoteBalance).toHaveBeenCalledWith(400)
    })
  })
```

- [ ] **Step 2: Run the test to verify the first case fails**

```bash
pnpm vitest run src/stores/transactions.spec.ts -t "remote balance on Mini App HTLC"
```

Expected: "does not debit…" FAILS (`updateActiveRemoteBalance` was called with `-500`); "debits…" already passes.

- [ ] **Step 3: Narrow the debit condition**

In `src/stores/transactions.ts`, replace the `else if` at line 313:

```ts
    else if (tx.transfer !== Transfer.LocalToRemote && tx.transfer !== Transfer.ExtendRemote) {
      await updateActiveRemoteBalance(remoteBalance.value - tx.amount)
    }
```

with:

```ts
    // Only the `new-htlc` funding tx is drawn from our remote HTLC. The redeem types drain a
    // foreign contract and pay the local wallet, so they must not move the remote balance.
    else if (tx.transfer !== Transfer.LocalToRemote && tx.transfer !== Transfer.ExtendRemote
      && !(partialTx.transfer === Transfer.HTLC && partialTx.htlcData.type !== 'new-htlc')) {
      await updateActiveRemoteBalance(remoteBalance.value - tx.amount)
    }
```

Read `partialTx`, not `tx`: `HtlcTransaction` does not declare `htlcData`, so `tx.htlcData` does not typecheck.

- [ ] **Step 4: Run the tests to verify both pass**

```bash
pnpm vitest run src/stores/transactions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/stores/transactions.ts src/stores/transactions.spec.ts
git commit -m "Only debit the remote balance for HTLC funding, not redeems"
```

---

### Task 3: Record rediscovered HTLC creations as `Transfer.HTLC`

`handleSwapTxs` asks Fastspot about every HTLC creation it finds behind a remote signer. A Mini App HTLC is not a Fastspot swap, the lookup throws, and the catch records it as a `Payment`. This is the second half of the review comment ("Same for `handleSwapTxs`").

Only the *lookup failure* branch changes. The branch further down — where Fastspot *does* know the contract but the asset pair is not NIM→BTC_LN — stays a `Payment`: those are real swaps and relabelling them would be a regression.

**Files:**
- Modify: `src/stores/transactions.ts` (add `addHtlcTransaction`, export it in the store's return object)
- Modify: `src/stores/sync/transactions.ts:341-371` (`handleSwapTxs`)
- Modify: `src/stores/sync/__tests__/setup.ts` (mock the new store action)
- Test: `src/stores/sync/transactions.spec.ts`

**Interfaces:**
- Consumes: `Transfer.HTLC` in `isExternalTx` from Task 1 — without it `addTransaction` would persist the row but never show it.
- Produces: `useTransactions().addHtlcTransaction(tx: HtlcTransaction): Promise<void>`. No later task consumes it.

- [ ] **Step 1: Add the mock for the new store action**

In `src/stores/sync/__tests__/setup.ts`, three edits so the new action exists on the mocked store:

1. Next to `const addStakingtransaction = vi.fn()` (line 30) add:
```ts
  const addHtlcTransaction = vi.fn()
```
2. In the returned object, after `addStakingtransaction,` (line 110) add `addHtlcTransaction,`.
3. In the `for (const fn of [...])` reset list, after `state.addStakingtransaction,` (line 233) add `state.addHtlcTransaction,`.
4. In the `vi.mock('@/stores/transactions', …)` factory, after `addStakingtransaction: state.addStakingtransaction,` (line 467) add `addHtlcTransaction: state.addHtlcTransaction,`.

- [ ] **Step 2: Write the failing tests**

Append to `src/stores/sync/transactions.spec.ts` inside the same `describe` that holds the existing "routes swap HTLCs found behind an extension chain to the swap handler" case at line 248. The default `state.getContract` mock already rejects with `new Error('mocked fastspot failure')` (setup.ts line 278), which is exactly the lookup-failure path.

```ts
    it('records an HTLC creation as Transfer.HTLC when Fastspot does not know the contract', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'mini-app-htlc-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ55 MINI APP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: 'ab'.repeat(32), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addHtlcTransaction).toHaveBeenCalledWith(expect.objectContaining({
        hash: 'mini-app-htlc-hash',
        transfer: 'htlc',
        title: 'New HTLC',
        amount: 500,
      }))
      expect(state.addUnknownPaymentToMerchantTransaction).not.toHaveBeenCalled()
    })

    it('still records a Payment when Fastspot knows the contract but the pair is unsupported', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getContract.mockResolvedValue({ from: { asset: 'BTC' }, to: { asset: 'NIM', amount: 1, fee: 0 } })
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'real-swap-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ66 SWAP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 700,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: 'cd'.repeat(32), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addUnknownPaymentToMerchantTransaction).toHaveBeenCalled()
      expect(state.addHtlcTransaction).not.toHaveBeenCalled()
    })
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm vitest run src/stores/sync/transactions.spec.ts -t "Fastspot"
```

Expected: the first case fails because `state.addHtlcTransaction` was never called; the second passes already.

- [ ] **Step 4: Add `addHtlcTransaction` to the transactions store**

In `src/stores/transactions.ts`, immediately after `addStakingtransaction` (line 466-469), add the mirror:

```ts
  async function addHtlcTransaction(tx: HtlcTransaction) {
    await upsertTx(tx)
    addTransaction(tx)
  }
```

Add `HtlcTransaction` to the existing type-only import from `@/types/transactions` on line 6, and add `addHtlcTransaction,` to the store's returned object next to `addStakingtransaction,` (line 605).

- [ ] **Step 5: Route Fastspot lookup failures to it**

In `src/stores/sync/transactions.ts`, destructure the new action alongside the others in the `useTransactions()` call at line 49-55 by adding `addHtlcTransaction,`.

Then replace the catch block of `handleSwapTxs` (lines 347-351):

```ts
    catch (error: any) {
      logger.error('Error fetching contract info from Fastspot:', error.message)
      addUnknownPaymentToMerchantTransaction(tx)
      return
    }
```

with:

```ts
    catch (error: any) {
      // Fastspot has never heard of this contract, so it is not a swap — it is a Mini App HTLC.
      logger.log(`📬 HTLC unknown to Fastspot, recording as a Mini App HTLC`, { hash: tx.transactionHash, recipient: tx.recipient, error: error.message })
      await addHtlcTransaction({
        transfer: Transfer.HTLC,
        amount: tx.value,
        fee: tx.fee,
        hash: tx.transactionHash,
        sender: tx.sender,
        senderType: toAccountType(tx.senderType),
        recipient: tx.recipient,
        recipientType: toAccountType(tx.recipientType),
        recipientData: tx.data?.raw ? Nimiq.BufferUtils.fromHex(tx.data.raw) : undefined,
        status: tx.state,
        timestamp: tx.timestamp,
        title: 'New HTLC',
        proofSize: tx.proof.raw.length / 2,
      })
      return
    }
```

No import change is needed in this file: the object literal is checked against `addHtlcTransaction`'s own parameter type, and `Transfer` is already imported on line 27.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm vitest run src/stores/sync/transactions.spec.ts
```

Two pre-existing tests break here by design, because both depend on the catch block you just changed. Ruled on during execution:

- `routes swap HTLCs found behind an extension chain to the swap handler` (line 248) — its subject is extension-chain traversal, and `addUnknownPaymentToMerchantTransaction` was only a proxy for "handleSwapTxs ran on the leaf". Keep the fixture and the branch, change the assertion to `expect(state.addHtlcTransaction).toHaveBeenCalledWith(expect.objectContaining({ hash: 'swap-leaf-hash' }))`. Note `hash`, not `transactionHash` — `addHtlcTransaction` receives the built `HtlcTransaction`. Do NOT add a `getContract` mock: that would silently move the test onto the unsupported-pair branch.
- `logs swap fetch errors and falls back to addUnknownPaymentToMerchantTransaction` (line 453) — asserts the removed `logger.error` call and the removed Payment fallback. Delete it; the new "records an HTLC creation…" test covers the same path with stronger assertions. First add `state.getContract.mockRejectedValue(new Error('fastspot down'))` to that new test, so it states the rejection locally instead of relying on the shared default in `setup.ts:278`.

Expected after those two edits: PASS, including the pre-existing own-HTLC-drain cases.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/stores/transactions.ts src/stores/sync/transactions.ts src/stores/sync/__tests__/setup.ts src/stores/sync/transactions.spec.ts
git commit -m "Record HTLCs unknown to Fastspot as Mini App HTLCs, not Payments"
```

---

### Task 4: Identify our own remote-signer HTLCs by their full contract shape

Two places currently treat "an HTLC whose creator is the local address" or "an HTLC with a zero `hashRoot`" as ours. `sendNewHtlcTransaction` defaults the Mini App HTLC's sender to the local address, so both heuristics fire on Mini App contracts: the redeem is dropped from history *and* `registerOwnHtlcIfMissing` writes the Mini App contract into `remote_signers`.

Fix by identifying our own HTLCs positively. `createDepositData` (`src/lib/tx.ts:544`) pins every field, so the full shape is an exact test. `hashAlgorithm` is deliberately excluded from the match.

**Files:**
- Modify: `src/types/transactions.ts` (add `ZERO_HASH_ROOT` and `isOwnRemoteHtlcShape` next to `isExternalTx`)
- Modify: `src/stores/nimiq-network.ts` (add `getHtlcCreationData`, export it)
- Modify: `src/stores/remote-signer.ts:371-394` (`registerOwnHtlcIfMissing`)
- Modify: `src/stores/sync/transactions.ts:166-197` (`categorizeTransactions`), `:142-145` and `:202`
- Modify: `src/stores/sync/lifecycle.ts:189-193`
- Test: `src/stores/remote-signer.spec.ts`, `src/stores/sync/transactions.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces:
  - `ZERO_HASH_ROOT: string` — `'0'.repeat(64)`.
  - `isOwnRemoteHtlcShape(htlc: { sender: string, recipient: string, hashRoot: string, hashCount: number }, addresses: { localAddress: string, cosignerAddress: string }): boolean`. The parameter shape is satisfied structurally by both `PlainHtlcContract` (from `getAccount`) and `PlainHtlcData` (from a creation tx's `data`).
  - `useNimiqNetwork().getHtlcCreationData(htlcAddress: Address): Promise<PlainHtlcData | undefined>`.

- [ ] **Step 1: Write the failing shape-guard tests**

Create `src/types/transactions.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isOwnRemoteHtlcShape, ZERO_HASH_ROOT } from './transactions'

const addresses = { localAddress: 'NQ00 LOCAL', cosignerAddress: 'NQ11 COSIGNER' }

function ourHtlc(overrides: Record<string, unknown> = {}) {
  return {
    sender: 'NQ00 LOCAL',
    recipient: 'NQ11 COSIGNER',
    hashRoot: ZERO_HASH_ROOT,
    hashCount: 1,
    ...overrides,
  }
}

describe('isOwnRemoteHtlcShape', () => {
  it('matches an HTLC created by createDepositData', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc(), addresses)).toBe(true)
  })

  it('rejects a Mini App HTLC that names a real counterparty', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ recipient: 'NQ77 COUNTERPARTY' }), addresses)).toBe(false)
  })

  it('rejects a Mini App HTLC with a real hash root', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ hashRoot: 'ab'.repeat(32) }), addresses)).toBe(false)
  })

  it('rejects a Mini App HTLC that mimics the zero hash root but not the cosigner', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ recipient: 'NQ77 COUNTERPARTY', hashCount: 1 }), addresses)).toBe(false)
  })

  it('rejects an HTLC whose sender is not the local wallet', () => {
    expect(isOwnRemoteHtlcShape(ourHtlc({ sender: 'NQ77 SOMEONE ELSE' }), addresses)).toBe(false)
  })

  it('ignores the hash algorithm', () => {
    expect(isOwnRemoteHtlcShape({ ...ourHtlc(), hashAlgorithm: 'sha256' } as any, addresses)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm vitest run src/types/transactions.spec.ts
```

Expected: FAIL — `isOwnRemoteHtlcShape is not a function` / no export named `ZERO_HASH_ROOT`.

- [ ] **Step 3: Implement the shape guard**

In `src/types/transactions.ts`, directly after `isExternalTx` (line 399), add:

```ts
export const ZERO_HASH_ROOT = '0'.repeat(64)

/**
 * Our own remote-signer HTLCs are created by `createDepositData`, which pins every contract field.
 * Matching the whole shape — rather than the zero hash root alone — is what keeps a Mini App HTLC
 * from being mistaken for ours. A Mini App would have to name our cosigner as the recipient to pass,
 * and such a contract is one only our cosigner can resolve early and only our local wallet can
 * resolve on timeout, so it is ours in every way that matters. `hashAlgorithm` is not matched.
 */
export function isOwnRemoteHtlcShape(
  htlc: { sender: string, recipient: string, hashRoot: string, hashCount: number },
  { localAddress, cosignerAddress }: { localAddress: string, cosignerAddress: string },
) {
  return htlc.sender === localAddress
    && htlc.recipient === cosignerAddress
    && htlc.hashRoot === ZERO_HASH_ROOT
    && htlc.hashCount === 1
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm vitest run src/types/transactions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing `registerOwnHtlcIfMissing` tests**

Append inside the existing `describe('registerOwnHtlcIfMissing', …)` block in `src/stores/remote-signer.spec.ts` (line 430). Note that the existing test at line 431 uses `hashRoot: '0'` and `recipient: 'NQ_R'` — it must be updated to a matching shape, or it will start failing. Change its `state.getAccount.mockResolvedValue` data to:

```ts
        data: { type: 'htlc', balance: 521, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ11 COSIGNER ADDRESS', timeout: 555_000, hashRoot: '0'.repeat(64), hashAlgorithm: 'sha256', hashCount: 1, totalAmount: 521 },
```

The existing "still registers when getAccount returns a non-htlc account (pruned post-drain)" test at line 484 must change too — the pruned path now consults the creation tx. Rename it and give it a creation-tx mock:

```ts
    it('registers a pruned HTLC whose creation tx shows our own shape', async () => {
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 100 }, error: undefined })
      state.getHtlcCreationData.mockResolvedValue({
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ11 COSIGNER ADDRESS',
        hashRoot: '0'.repeat(64),
        hashCount: 1,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      await store.registerOwnHtlcIfMissing('NQ44 PRUNED HTLC')

      expect(state.run).toHaveBeenCalledWith(
        expect.any(String),
        ['NQ44 PRUNED HTLC', 0, 98, 'service-public-key', 0, 0, false],
      )
    })
```

Then add the two new cases:

```ts
    it('does not register a Mini App HTLC whose contract shape is not ours', async () => {
      state.getAccount.mockResolvedValue({
        data: { type: 'htlc', balance: 500, sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', timeout: 555_000, hashRoot: 'ab'.repeat(32), hashAlgorithm: 'blake2b', hashCount: 1, totalAmount: 500 },
        error: undefined,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      await store.registerOwnHtlcIfMissing('NQ55 MINI APP HTLC ADDRESS')

      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ55 MINI APP HTLC ADDRESS']),
      )
    })

    it('does not register a pruned HTLC whose creation tx is not ours', async () => {
      state.getAccount.mockResolvedValue({ data: { type: 'basic', balance: 0 }, error: undefined })
      state.getHtlcCreationData.mockResolvedValue({
        sender: 'NQ00 TEST LOCAL ADDRESS',
        recipient: 'NQ77 SOME COUNTERPARTY',
        hashRoot: 'ab'.repeat(32),
        hashCount: 1,
      })

      const { useRemoteSigner } = await import('./remote-signer')
      const store = useRemoteSigner()
      await Promise.resolve()
      await Promise.resolve()

      await store.registerOwnHtlcIfMissing('NQ55 PRUNED MINI APP HTLC')

      expect(state.run).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['NQ55 PRUNED MINI APP HTLC']),
      )
    })
```

These need a `getHtlcCreationData` mock and a cosigner address. Four exact edits to `src/stores/remote-signer.spec.ts`:

1. Inside the `vi.hoisted(() => { … })` block, next to `const getAccount = vi.fn(…)` (line 14), add:
```ts
  const getHtlcCreationData = vi.fn((): Promise<any> => Promise.resolve(undefined))
```
2. In that block's returned object, after `getAccounts,` (line 58), add `getHtlcCreationData,`.
3. In the `vi.mock('@/stores/nimiq-network', …)` factory (line 138), after `getAccounts: state.getAccounts,` (line 141), add `getHtlcCreationData: state.getHtlcCreationData,`.
4. In the `beforeEach` at line 164, extend the `vi.stubGlobal('Nimiq', …)` object (line 167) with a `PublicKey` entry so `remotePublicKey` (`'service-public-key'`) resolves to a cosigner address:
```ts
    vi.stubGlobal('Nimiq', {
      Address: {
        fromUserFriendlyAddress: (value: string) => createAddress(value),
        fromString: (value: string) => createAddress(value),
      },
      PublicKey: {
        fromHex: () => ({ toAddress: () => createAddress('NQ11 COSIGNER ADDRESS') }),
      },
      Policy: {
        BLOCKS_PER_BATCH: 32,
      },
    })
```
and add `state.getHtlcCreationData.mockReset()` next to the other `mockReset()` calls further down that same `beforeEach` (they start at line 190).

- [ ] **Step 6: Run to verify the new cases fail**

```bash
pnpm vitest run src/stores/remote-signer.spec.ts -t "registerOwnHtlcIfMissing"
```

Expected: the two "does not register…" cases FAIL — the row is still written.

- [ ] **Step 7: Add `getHtlcCreationData` to the network store**

In `src/stores/nimiq-network.ts`, add `PlainHtlcData` to the type-only import on line 1, then add this function directly after `getAllOutgoingTransactionsFromHtlcs` (which ends at line 269):

```ts
  /**
   * Reads an HTLC's contract parameters from its creation transaction. Needed when the contract has
   * been fully drained and pruned, so `getAccount` no longer returns it — the history index keeps
   * the creation tx forever.
   */
  async function getHtlcCreationData(htlcAddress: Address): Promise<PlainHtlcData | undefined> {
    try {
      const plainHtlcAddress = htlcAddress.toUserFriendlyAddress()
      const txs = await client.value?.getTransactionsByAddress(htlcAddress) || []
      const creation = txs.find(tx => tx.recipient === plainHtlcAddress && tx.recipientType === 'htlc')
      return creation && 'hashRoot' in creation.data ? creation.data : undefined
    }
    catch (error) {
      logger.error('Error getting HTLC creation data', error)
      return undefined
    }
  }
```

Add `getHtlcCreationData,` to the store's returned object next to `getAllOutgoingTransactionsFromHtlcs,` (line 284).

- [ ] **Step 8: Gate `registerOwnHtlcIfMissing` on the shape**

In `src/stores/remote-signer.ts`, replace the body of `registerOwnHtlcIfMissing` (lines 371-394) with:

```ts
  async function registerOwnHtlcIfMissing(htlcAddress: string): Promise<void> {
    if (await isOurRemoteSigner(htlcAddress))
      return
    if (!remotePublicKey.value)
      return
    const address = Nimiq.Address.fromUserFriendlyAddress(htlcAddress)
    const cosignerAddress = Nimiq.PublicKey.fromHex(remotePublicKey.value).toAddress().toUserFriendlyAddress()
    const localUserFriendly = localAddress.value!.toUserFriendlyAddress()

    // The account is gone once the HTLC has been fully drained, so fall back to its creation tx.
    // Without a readable shape we must not register: a Mini App HTLC in `remote_signers` would make
    // the app try to extend or reclaim a contract it does not own.
    const { data: account } = await useNimiqNetwork().getAccount(address)
    const shape = account?.type === 'htlc'
      ? account
      : await useNimiqNetwork().getHtlcCreationData(address)
    if (!shape || !isOwnRemoteHtlcShape(shape, { localAddress: localUserFriendly, cosignerAddress })) {
      logger.log(`🚫 Not registering HTLC — contract shape is not ours`, { address: htlcAddress, shape })
      return
    }

    const balance = account?.type === 'htlc' ? account.balance : 0
    const end = account?.type === 'htlc' ? account.timeout : 0
    await addInactiveRemoteSigner({
      active: false,
      address,
      balance,
      end,
      start: 0,
      publicKey: remotePublicKey.value,
      proofSize: remoteProofSize.value,
    })
    invalidateRemoteSignerAddressCache()
    logger.log(`📝 Registered previously-unknown own HTLC`, { address: htlcAddress, end, balance, accountType: account?.type ?? 'pruned' })
  }
```

Add `isOwnRemoteHtlcShape` to the imports from `@/types/transactions` (the file already imports `Transfer` from there via `@/lib/sql-queries`; add a direct import if none exists).

- [ ] **Step 9: Run to verify the remote-signer tests pass**

```bash
pnpm vitest run src/stores/remote-signer.spec.ts
```

Expected: PASS, including the two updated pre-existing cases.

- [ ] **Step 10: Write the failing `categorizeTransactions` test**

Append inside the same `describe` as Task 3's cases in `src/stores/sync/transactions.spec.ts`:

```ts
    it('does not traverse a Mini App HTLC that mimics the zero hash root', async () => {
      const signer = { address: 'NQ22 TEST FUNDED REMOTE ADDRESS', balance: 0, active: true, publicKey: 'k', start: 100_000, end: 300_000, proofSize: 98 }
      state.getAllRemoteSigners.mockResolvedValue([{ ...signer, address: createAddress(signer.address) }] as any)
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ22 TEST FUNDED REMOTE ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'mimic-hash',
            sender: 'NQ22 TEST FUNDED REMOTE ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ55 MINI APP HTLC ADDRESS',
            recipientType: 'htlc',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            // Zero hash root, but the recipient is a real counterparty rather than our cosigner.
            data: { raw: '', sender: 'NQ00 TEST LOCAL ADDRESS', recipient: 'NQ77 SOME COUNTERPARTY', hashRoot: '0'.repeat(64), hashCount: 1 },
            proof: { raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.getAllOutgoingTransactionsFromHtlcs).not.toHaveBeenCalled()
      expect(state.addHtlcTransaction).toHaveBeenCalledWith(expect.objectContaining({ hash: 'mimic-hash' }))
    })
```

Add `PublicKey: { fromHex: () => ({ toAddress: () => ({ toUserFriendlyAddress: () => 'NQ11 COSIGNER ADDRESS' }) }) }` to `stubNimiqGlobal()` in `src/stores/sync/__tests__/setup.ts` (line 149) so `categorizeTransactions` can resolve the cosigner address.

- [ ] **Step 11: Run to verify it fails**

```bash
pnpm vitest run src/stores/sync/transactions.spec.ts -t "mimics the zero hash root"
```

Expected: FAIL — `getAllOutgoingTransactionsFromHtlcs` was called, because the current check sees only the zero `hashRoot`.

- [ ] **Step 12: Tighten `categorizeTransactions`**

In `src/stores/sync/transactions.ts`, `categorizeTransactions` (line 166) is declared inside `updateTransactionHistory`, so it can close over an address pair resolved once per run.

Immediately before the `function categorizeTransactions` declaration, add:

```ts
      // Resolved once per refresh: `isOwnRemoteHtlcShape` needs both addresses to tell our own
      // extension chain apart from a Mini App HTLC. Without a cosigner key we cannot tell them
      // apart at all, so the remote-signer scan below is skipped rather than risking either error.
      const localUserFriendlyForShape = localAddress.value.toUserFriendlyAddress()
      const cosignerAddress = useRemoteSigner().remotePublicKey
        ? Nimiq.PublicKey.fromHex(useRemoteSigner().remotePublicKey!).toAddress().toUserFriendlyAddress()
        : undefined
```

Replace the `recipientType === 'htlc'` branch (lines 173-179):

```ts
          if (tx.recipientType === 'htlc') {
            const data = tx.data
            if ('hashRoot' in data && data.hashRoot === '0000000000000000000000000000000000000000000000000000000000000000')
              htlcExtensionTxs.push(tx)
            else
              htlcSwapTxs.push(tx)
          }
```

with:

```ts
          if (tx.recipientType === 'htlc') {
            const data = tx.data
            if ('hashRoot' in data && cosignerAddress && isOwnRemoteHtlcShape(data, { localAddress: localUserFriendlyForShape, cosignerAddress }))
              htlcExtensionTxs.push(tx)
            else
              htlcSwapTxs.push(tx)
          }
```

Then guard the remote-signer scan. Change the condition at line 202:

```ts
      if (remoteSigners && remoteSigners.length) {
```

to:

```ts
      if (!cosignerAddress) {
        logger.error('Skipping remote signer scan: remote public key unavailable, cannot tell our own HTLCs apart from Mini App HTLCs')
      }
      else if (remoteSigners && remoteSigners.length) {
```

Add `isOwnRemoteHtlcShape` to the import from `@/types/transactions` on line 27.

- [ ] **Step 13: Run the sync tests to verify they pass**

```bash
pnpm vitest run src/stores/sync/
```

Expected: PASS. If a pre-existing extension-chain case now fails, its fixture's `data` needs `sender`/`recipient`/`hashCount` filled in to match our shape — update the fixture, not the guard.

- [ ] **Step 14: Write the failing drain-swallowing tests**

`isOwnHtlcDrain` still returns `true` for a Mini App redeem-timeout or redeem-early, because the Mini App HTLC's sender defaults to the local wallet and that is what `proof.creator` reports. Both callers therefore still drop the transaction on the floor. After the shape gate above, `remote_signers` is trustworthy, so membership in it — not the proof heuristic — is what should decide.

First update the two pre-existing cases in `src/stores/sync/transactions.spec.ts` (lines 195-209), which currently assume the proof heuristic alone decides. Each needs the address to actually be one of ours:

```ts
      it('drops a timeout-resolve drain whose creator is the local address', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve'))
        state.isOurRemoteSigner.mockResolvedValue(true)
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ44 SOME HTLC ADDRESS')
      })

      it('drops an early-resolve drain whose creator is the local address', async () => {
        mockLocalAddressTxs(ownHtlcDrain('early-resolve'))
        state.isOurRemoteSigner.mockResolvedValue(true)
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).not.toHaveBeenCalled()
        expect(state.registerOwnHtlcIfMissing).toHaveBeenCalledWith('NQ44 SOME HTLC ADDRESS')
      })
```

Then add the new case in the same `describe('own-HTLC drain filtering', …)` block:

```ts
      it('keeps a Mini App HTLC drain that registration refused to claim as ours', async () => {
        mockLocalAddressTxs(ownHtlcDrain('timeout-resolve'))
        // registerOwnHtlcIfMissing saw a foreign contract shape and declined to register it.
        state.isOurRemoteSigner.mockResolvedValue(false)
        const { useSyncTransactions } = await import('./transactions')
        await useSyncTransactions().updateTransactionHistory()
        expect(state.addReceiptTransaction).toHaveBeenCalledWith(expect.objectContaining({
          hash: 'drain-hash',
        }))
      })
```

- [ ] **Step 15: Run to verify the new case fails**

```bash
pnpm vitest run src/stores/sync/transactions.spec.ts -t "own-HTLC drain filtering"
```

Expected: the new "keeps a Mini App HTLC drain…" case FAILS — the drain is still dropped.

- [ ] **Step 16: Let `remote_signers` membership decide, not the proof**

In `src/stores/sync/transactions.ts`, the batch at lines 128-136 already runs `registerOwnHtlcIfMissing` for every candidate before the loop, so by line 142 the table is authoritative. Replace lines 142-145:

```ts
        if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress())) {
          logger.log(`🚫 updateTransactionHistory skipped own-HTLC drain`, { hash: tx.transactionHash, sender: tx.sender, amount: tx.value })
          return
        }
```

with:

```ts
        // The pre-scan above already offered every candidate to registerOwnHtlcIfMissing, which
        // only accepts our own contract shape. Anything it declined is a Mini App HTLC and belongs
        // in the history.
        if (tx.senderType === 'htlc' && await useRemoteSigner().isOurRemoteSigner(tx.sender)) {
          logger.log(`🚫 updateTransactionHistory skipped own-HTLC drain`, { hash: tx.transactionHash, sender: tx.sender, amount: tx.value })
          return
        }
```

In `src/stores/sync/lifecycle.ts`, replace lines 189-193:

```ts
    if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress())) {
      logger.log(`🚫 handleIncomingTransaction skipped own-HTLC drain`, { hash, sender: tx.sender, amount: tx.value })
      await useRemoteSigner().registerOwnHtlcIfMissing(tx.sender)
      return
    }
```

with:

```ts
    // Offer the HTLC for registration first — it only accepts our own contract shape. If it stays
    // unclaimed the drain came from a Mini App HTLC and must be recorded, not dropped.
    if (isOwnHtlcDrain(tx, localAddress.value.toUserFriendlyAddress())) {
      await useRemoteSigner().registerOwnHtlcIfMissing(tx.sender)
      if (await useRemoteSigner().isOurRemoteSigner(tx.sender)) {
        logger.log(`🚫 handleIncomingTransaction skipped own-HTLC drain`, { hash, sender: tx.sender, amount: tx.value })
        return
      }
    }
```

`isOwnHtlcDrain` keeps its current signature and stays exported — it is still the cheap pre-filter that decides who gets offered for registration.

- [ ] **Step 17: Run the sync tests to verify they pass**

```bash
pnpm vitest run src/stores/sync/
```

Expected: PASS, including the two updated pre-existing drain cases.

- [ ] **Step 18: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/types/transactions.ts src/types/transactions.spec.ts src/stores/nimiq-network.ts src/stores/remote-signer.ts src/stores/remote-signer.spec.ts src/stores/sync/transactions.ts src/stores/sync/lifecycle.ts src/stores/sync/transactions.spec.ts src/stores/sync/__tests__/setup.ts
git commit -m "Identify our own remote-signer HTLCs by their full contract shape"
```

---

### Task 5: Stop the Top-Up path overwriting stored HTLC redeems

A Mini App redeem pays the local address, so the incoming-transaction listener and the local-account loop both see it. Both dedup only against `GetAllUserReceipts`, so the `Transfer.HTLC` row written by `_sendTx` is invisible to them and `buildTopUpReceipt` overwrites it via `INSERT OR REPLACE`.

Switch both to `SelectAllTransactions`, which after Task 1 covers every displayable transfer including `htlc`. One query, not one per transaction.

**Files:**
- Modify: `src/stores/sync/lifecycle.ts:181`
- Modify: `src/stores/sync/transactions.ts:125` and `:153`
- Test: `src/stores/sync/transactions.spec.ts`

**Interfaces:**
- Consumes: `Transfer.HTLC` in `SelectAllTransactions` from Task 1. Without it this change is a no-op.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

Append to `src/stores/sync/transactions.spec.ts`:

```ts
    it('does not overwrite a stored Mini App HTLC redeem with a Top-Up', async () => {
      state.getAccountTransactions.mockImplementation(((address: any) => {
        if (address?.toUserFriendlyAddress?.() === 'NQ00 TEST LOCAL ADDRESS') {
          return Promise.resolve({ data: [{
            transactionHash: 'redeem-hash',
            sender: 'NQ55 MINI APP HTLC ADDRESS',
            senderType: 'htlc',
            recipient: 'NQ00 TEST LOCAL ADDRESS',
            recipientType: 'basic',
            value: 500,
            fee: 0,
            state: 'confirmed',
            timestamp: 1,
            data: { raw: '' },
            proof: { type: 'regular-transfer', raw: '' },
          }] })
        }
        return Promise.resolve({ data: [] })
      }) as any)
      // SelectAllTransactions (`transfer IN (...)`) already holds the redeem we sent ourselves.
      state.query.mockImplementation((sql = '') => {
        if (sql.includes('transfer IN ('))
          return Promise.resolve([{ hash: 'redeem-hash', transfer: 'htlc', sender: 'NQ55 MINI APP HTLC ADDRESS' }])
        return Promise.resolve([])
      })

      const { useSyncTransactions } = await import('./transactions')
      await useSyncTransactions().updateTransactionHistory()

      expect(state.addReceiptTransaction).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm vitest run src/stores/sync/transactions.spec.ts -t "does not overwrite a stored Mini App HTLC redeem"
```

Expected: FAIL — `addReceiptTransaction` was called with the Top-Up receipt.

- [ ] **Step 3: Widen the dedup set in the history refresh**

In `src/stores/sync/transactions.ts`, change line 125:

```ts
      const userReceipts: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
```

to:

```ts
      // Any already-recorded transfer, not just receipts — otherwise a Mini App HTLC redeem we
      // stored ourselves gets re-recorded here as a Top-Up and clobbers the original row.
      const knownTxs: ExternalTransaction[] = await useConn().query(SQLQuery.SelectAllTransactions)
```

and line 153:

```ts
        if (userReceipts.some(dbTx => dbTx.hash === hash))
```

to:

```ts
        if (knownTxs.some(dbTx => dbTx.hash === hash))
```

Leave line 164 untouched — its separate `GetAllUserReceipts` query genuinely needs receipts only, to build `topUpAddresses`. Remove the now-unused `UserReceiptTransaction` from the type-only import on line 5 only if line 164's annotation no longer references it; it does, so keep it.

- [ ] **Step 4: Widen the dedup set in the live listener**

In `src/stores/sync/lifecycle.ts`, change line 181:

```ts
    const dbTxs: UserReceiptTransaction[] = await useConn().query(SQLQuery.GetAllUserReceipts)
```

to:

```ts
    // Any already-recorded transfer — see the matching note in updateTransactionHistory.
    const dbTxs: ExternalTransaction[] = await useConn().query(SQLQuery.SelectAllTransactions)
```

Update the type-only imports at the top of the file: add `ExternalTransaction`, and drop `UserReceiptTransaction` if nothing else in the file uses it.

- [ ] **Step 5: Run the sync tests to verify they pass**

```bash
pnpm vitest run src/stores/sync/
```

Expected: PASS. The pre-existing "skips transactions already stored in the database" case at line 159 mocks on `sql.includes('transfer = ')` for receipts and returns `[]` otherwise — it will need its mock switched to `transfer IN (` to keep asserting what it means to assert. Update it.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add src/stores/sync/lifecycle.ts src/stores/sync/transactions.ts src/stores/sync/transactions.spec.ts
git commit -m "Dedup incoming transactions against all stored transfers, not just receipts"
```

---

### Task 6: Show HTLC redeems as incoming

Redeems pay the user, so they must read as incoming. Fundings must *not* borrow the withdrawal icon: a funding is not a withdrawal, and that icon already means "remote HTLC → external address" at `TransactionItem.vue:43`. Fundings keep the default `MerchantCategory.Shop` icon and rely on their `New HTLC` title.

A redeem counts as incoming only when it actually pays us — a Mini App may name any recipient, and showing a third-party payout as incoming would make the detail sheet hide the real recipient and present the HTLC contract as the counterparty.

**Files:**
- Modify: `src/types/transactions.ts` (add `isHtlcRedeemToSelf` next to `isOwnRemoteHtlcShape`)
- Modify: `src/components/TransactionItem.vue:39-49`
- Modify: `src/components/TransactionDetails.vue:39`
- Test: `src/components/TransactionItem.spec.ts`, `src/components/TransactionDetails.spec.ts`

**Interfaces:**
- Consumes: `ExternalTransaction` includes `HtlcTransaction` (Task 1) — both components are typed against it.
- Produces: `isHtlcRedeemToSelf(tx: Pick<Transaction, 'transfer' | 'senderType' | 'recipient'>, localAddress: string): boolean`.

- [ ] **Step 1: Write the failing guard tests**

Append to `src/types/transactions.spec.ts` (created in Task 4):

```ts
describe('isHtlcRedeemToSelf', () => {
  beforeEach(() => {
    vi.stubGlobal('Nimiq', { AccountType: { Basic: 0, HTLC: 2 } })
  })

  it('matches a redeem paying the local wallet', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ00 LOCAL' } as any,
      'NQ00 LOCAL',
    )).toBe(true)
  })

  it('rejects a redeem paying a third party', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ77 SOMEONE ELSE' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })

  it('rejects an HTLC funding', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.HTLC, senderType: 2, recipient: 'NQ55 NEW CONTRACT' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })

  it('rejects a non-HTLC transfer paying the local wallet', () => {
    expect(isHtlcRedeemToSelf(
      { transfer: Transfer.UserReceipt, senderType: 2, recipient: 'NQ00 LOCAL' } as any,
      'NQ00 LOCAL',
    )).toBe(false)
  })
})
```

Extend the file's imports to `import { beforeEach, describe, expect, it, vi } from 'vitest'` and add `isHtlcRedeemToSelf, Transfer` to the import from `./transactions`.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm vitest run src/types/transactions.spec.ts
```

Expected: FAIL — `isHtlcRedeemToSelf is not a function`.

- [ ] **Step 3: Implement the guard**

In `src/types/transactions.ts`, directly after `isOwnRemoteHtlcShape`, add:

```ts
/**
 * A Mini App may name any recipient on a redeem, so paying *us* is what makes it incoming.
 * Takes the local address as a parameter to keep this module free of store imports — the same
 * reason `isOwnHtlcDrain` in `stores/sync/transactions.ts` does.
 */
export function isHtlcRedeemToSelf(tx: Pick<Transaction, 'transfer' | 'senderType' | 'recipient'>, localAddress: string) {
  return tx.transfer === Transfer.HTLC
    && tx.senderType === Nimiq.AccountType.HTLC
    && tx.recipient === localAddress
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm vitest run src/types/transactions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing component tests**

In `src/components/TransactionItem.spec.ts`, first make the stubbed icon assertable — replace the `CategoryIcon` mock at line 34:

```ts
vi.mock('./icons/categories/CategoryIcon.vue', () => ({
  default: defineComponent({
    props: ['category'],
    template: '<div data-testid="category-icon">{{ category }}</div>',
  }),
}))
```

Add a local-wallet mock next to the `@/stores/app` mock at line 64:

```ts
vi.mock('@/stores/local-wallet', () => ({
  useLocalWallet: () => ({
    localAddress: { toUserFriendlyAddress: () => 'NQ00 TEST LOCAL ADDRESS' },
  }),
}))
```

Then append two cases inside `describe('transactionItem', …)`:

```ts
  it('shows a redeem paying the local wallet with the deposit icon', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'Redeem HTLC (regular)',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xredeem',
          sender: 'NQ55 MINI APP HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
      global: { stubs: { IonRippleEffect: true } },
    })

    expect(wrapper.get('[data-testid="category-icon"]').text()).toBe('deposit')
  })

  it('does not give an HTLC funding the withdraw icon', async () => {
    const { default: TransactionItem } = await import('./TransactionItem.vue')
    const wrapper = mount(TransactionItem, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'New HTLC',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xfunding',
          sender: 'NQ11 TEST REMOTE ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ55 MINI APP HTLC ADDRESS',
          recipientType: 'htlc',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
      global: { stubs: { IonRippleEffect: true } },
    })

    const icon = wrapper.get('[data-testid="category-icon"]').text()
    expect(icon).not.toBe('withdraw')
    expect(icon).not.toBe('deposit')
  })
```

In `src/components/TransactionDetails.spec.ts`, add the same `@/stores/local-wallet` mock next to the `@/stores/app` mock at line 54, then append:

```ts
  it('treats an HTLC redeem paying the local wallet as incoming', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'Redeem HTLC (regular)',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xredeem',
          sender: 'NQ55 MINI APP HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ00 TEST LOCAL ADDRESS',
          recipientType: 'basic',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
    })

    expect(wrapper.text()).toContain('Sender')
    expect(wrapper.text()).not.toContain('Recipient')
  })

  it('treats an HTLC redeem paying a third party as outgoing', async () => {
    const { default: TransactionDetails } = await import('./TransactionDetails.vue')
    const wrapper = mount(TransactionDetails, {
      props: {
        tx: {
          transfer: Transfer.HTLC,
          title: 'Redeem HTLC (regular)',
          timestamp: Date.now(),
          amount: 2500000,
          fee: 0,
          hash: '0xredeem-third-party',
          sender: 'NQ55 MINI APP HTLC ADDRESS',
          senderType: 'htlc',
          recipient: 'NQ77 SOMEONE ELSE',
          recipientType: 'basic',
          status: 'confirmed',
          proofSize: 0,
          asset: Asset.NIM,
          chain: Chain.Nimiq,
        },
      },
    })

    expect(wrapper.text()).toContain('Recipient')
  })
```

`TransactionDetails.spec.ts` has no `Nimiq` global stub. Add one in a `beforeEach` inside its `describe`:

```ts
  beforeEach(() => {
    vi.stubGlobal('Nimiq', { AccountType: { HTLC: 'htlc', Basic: 'basic' } })
  })
```

and add `beforeEach` to its `vitest` import.

- [ ] **Step 6: Run to verify they fail**

```bash
pnpm vitest run src/components/TransactionItem.spec.ts src/components/TransactionDetails.spec.ts
```

Expected: the deposit-icon case FAILS (renders `shop`), and the incoming case FAILS (renders `Recipient`). The funding case and the third-party case already pass — they are regression guards.

- [ ] **Step 7: Wire the guard into `TransactionItem.vue`**

Add `isHtlcRedeemToSelf` to the import from `@/types/transactions` on line 12, and `useLocalWallet` from `@/stores/local-wallet`. Then add one branch to `category` (line 39), after the existing `'withdraw'` branch:

```ts
const category = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
    return tx.merchantCategory || MerchantCategory.Shop
  if (tx.transfer === Transfer.UserPayment && tx.senderType === Nimiq.AccountType.HTLC && tx.recipientType === Nimiq.AccountType.Basic)
    return 'withdraw'
  if (tx.transfer === Transfer.UserReceipt || isHtlcRedeemToSelf(tx, useLocalWallet().localAddress.toUserFriendlyAddress()))
    return 'deposit'

  return MerchantCategory.Shop
})
```

Fold the new condition into the existing `'deposit'` branch rather than adding a second branch with the same return value.

- [ ] **Step 8: Wire the guard into `TransactionDetails.vue`**

Add `isHtlcRedeemToSelf` to the import from `@/types/transactions` on line 27 and `useLocalWallet` from `@/stores/local-wallet`, then change line 39:

```ts
const isIncoming = computed(() => props.tx.transfer === Transfer.UserReceipt
  || isHtlcRedeemToSelf(props.tx, useLocalWallet().localAddress.toUserFriendlyAddress()))
```

- [ ] **Step 9: Run the component tests to verify they pass**

```bash
pnpm vitest run src/components/
```

Expected: PASS.

- [ ] **Step 10: Run the whole suite, lint, typecheck, commit**

```bash
pnpm test:unit -- --run
pnpm lint && pnpm typecheck
git add src/types/transactions.ts src/types/transactions.spec.ts src/components/TransactionItem.vue src/components/TransactionItem.spec.ts src/components/TransactionDetails.vue src/components/TransactionDetails.spec.ts
git commit -m "Show Mini App HTLC redeems as incoming transactions"
```

---

## Manual verification

Unit tests do not exercise the real client, so confirm the end-to-end behaviour on device once Task 6 lands. The Mini App test page added by this branch (`mini-app-sdk/dapp/src/components/HTLC.vue`) drives all five methods.

- [ ] Fund a new HTLC from the Mini App test page. It appears immediately in the history as "New HTLC".
- [ ] Pull to refresh. It stays "New HTLC" — it does not become "Payment". Confirm with `grep -E "💸 addUnknownPaymentToMerchantTransaction"` on `cache/logs.txt`; the HTLC hash must not appear.
- [ ] Redeem it regularly. It appears as "Redeem HTLC (regular)" with the deposit icon, and the home balance does not dip by the redeemed amount.
- [ ] Redeem another HTLC by timeout. Confirm it is *not* swallowed: `grep -E "🚫.*own-HTLC"` must not list the Mini App HTLC address, and `grep -E "🚫 Not registering HTLC"` should show the shape rejection.
- [ ] Check `remote_signers` is unpolluted via `grep -E "🔄.*cache rebuilt"` — the rebuilt set must contain only our own HTLC chain, not the Mini App contract.
- [ ] Force-close and reopen the app. All HTLC transactions are still present with their HTLC titles.

## Known limitation (do not "fix" opportunistically)

After a database wipe (reinstall or `clearTxHistory`), a Mini App redeem paying the local address is re-recorded as a "Top-Up". This is documented and accepted in the spec's "Deliberately out of scope" section — the local-account loop runs before the remote-signer scan that would recreate the identifying row. The transaction is still present with the correct amount, timestamp and counterparty, and still renders as an incoming deposit; only the title degrades. Reordering those two blocks is a separate change with its own tests.
