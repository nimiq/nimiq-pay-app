# HTLC Lab

Local operator tool for reproducing Nimiq Pay recovery issues with real on-chain transactions. The tool creates the setup independently of app stores. It verifies chain evidence; you verify the app.

## Launch

Use the repository's existing dependencies (Node 24 and pnpm). From the repository root:

```sh
pnpm dev:htlc-lab
```

Open http://127.0.0.1:5190. Keep the server and browser open for the entire run. The package intentionally uses root dependencies and lockfile; do not run a separate install in this directory. `build` validates the bundle; operate through `dev`, which provides the fixed cosigner/faucet proxies. Do not deploy this development server publicly.

## Wallets and funding

1. Import the app wallet's 12 recovery words. Confirm its displayed address matches Nimiq Pay. Derivation matches the app: `m/44'/242'/0'/0'`.
2. Generate a separate spam wallet for the history bomb. Back up its words privately before funding it.
3. Select testnet (default) or mainnet and connect. Both the core client and cosigner must agree on the network. The network is locked after connection; finish cleanup and open a fresh session to change it.
4. Fund the displayed addresses manually. Testnet also offers a faucet button. A successful request is not yet a spendable balance: wait for the balance to update. Honor faucet cooldowns; geoblocking or an empty faucet requires manual funding.
5. Close Nimiq Pay. Its background recovery would otherwise change the test setup.

Amounts use **NIM**, with up to five decimal places; fees use **whole Luna**. Default HTLC amount is 0.01 NIM and the default fee is zero. For funding calculations, convert the fee to NIM by dividing by 100,000. Two-HTLC and bomb scenarios need twice the amount plus creation fee; the drained scenario reserves the amount plus three fees. Each spam transfer costs 0.00001 NIM plus its fee. The dashboard shows the required totals in NIM. Each HTLC must hold more than its cleanup fee, which is deducted from its live balance.

Both wallet recovery phrases are saved **unencrypted in local storage** for this browser profile and origin, then restored automatically on reload. No analytics or server-side signing is used. “Clear saved wallets” removes the stored phrases without interrupting loaded wallets or the current run. Refreshing loses **run tracking**, not saved wallets or on-chain funds. Export reports and back up generated words first. Importing the same account into a new session does not restore the old run; use the report's addresses with the app's manual recovery if needed. Hot reload is disabled to protect active sessions. Finish funded runs before restarting the development server or refreshing to load code changes.

## Scenarios

### Two funded HTLCs

Create A, wait for confirmation, then review and create B. Wait for both live balances and cosigner recognition. Only then open the app.

**Expected:** both contracts are discovered and funds remain accounted for. The app may drain/consolidate an older contract; do not expect both to remain funded. Check for duplicate history and lost balance.

### Drained old HTLC

Create A, wait for confirmation, return A through the cosigner, and wait until its live balance is zero. Create B and wait for confirmation.

**Expected:** the app restores A's history without restoring its drained balance or displacing the funded signer. The cosigner can require more blocks before allowing the drain; wait for the indicated height, then continue.

### Expired funded HTLC

Create A with a short expiry (default five minutes). Keep the app closed until **chain time**, not just the local clock, passes the expiry. A must still be funded.

**Expected:** the app recovers A via timeout and classifies the recovery correctly. The tool does not perform that recovery automatically.

### Funded HTLC before restore

Create A (14-day expiry) and keep at least the same amount again in the app wallet. Wait for A's confirmation and cosigner recognition. Then, in Nimiq Pay, log out and import the app wallet's recovery words. Logging out deletes the app database, so the restored app does not know A.

**Expected:** the app shows “Checking your account” and holds the wallet funds instead of creating a new HTLC. It finds A from history, drains it, then creates one HTLC with all funds. Fail the run if a second funded HTLC appears next to A. The hold lasts at most 10 minutes; if it times out, the app creates the HTLC anyway and must merge A on a later check.

### History bomb

1. Create A and reserve owner funds for B.
2. Wait until A expires while remaining funded.
3. Fund the separate spam wallet.
4. Review and start the spam batch. Every receipt is exactly 0.00001 NIM plus the chosen fee paid by the spam wallet.
5. Wait until **all unique requested transactions confirm successfully**.
6. Review and create B. Wait for confirmation and the history-order check.
7. Open the app only after “Chain setup verified.”

Default 250 transfers crosses the app's current 100-entry history page. Counts 1–1,000 are supported; counts below 100 are useful smoke tests but do not reliably test pagination. Unique run/index data prevents identical transaction hashes. Submission is capped at two per second and 20 unresolved transactions, so finality can make it much slower than `count / 2` seconds.

**Expected:** the app finds old, expired A behind the spam and recovers its funds without losing B's funds. Look for duplicate receipts, false payments, and restored historical balances. The tool verifies that all spam lies between B and A in owner history.

## Waiting, failure, and cancellation

- **Pending/included:** wait. Setup progression requires successful confirmation, not just inclusion.
- **Unknown:** a timeout or missing execution result does not prove failure. The same hash stays tracked. Do not create a replacement or assume `txSent: false` means no broadcast. The ledger offers **Recheck & rebroadcast** for unresolved direct transactions: it checks the chain first, then resends only identical signed bytes within the original validity window. No new hash or extra transfer is created. Cosigner/recovery requests are not replayed. A hash that remains unresolved needs investigation; cleanup stays blocked.
- **Failed:** the scenario stops. Export evidence and clean up after remaining submissions resolve. Do not mark an incomplete bomb as passing.
- **Pause:** stops new spam only. Already submitted transactions continue to reconcile. Resume continues with the next unique index.
- **Cancel:** ends the scenario and prevents B creation. Already submitted transactions remain tracked. Cancellation cannot undo broadcasts.
- **Insufficient funds:** fund the correct wallet and wait for the balance to update. During spam, pause first. Do not reopen the app to move funds during setup.
- **Connectivity/history errors:** keep the page open. Checks retry without replacing transactions. A failed or incomplete history scan cannot declare the setup ready.

## App checks, reports, and cleanup

Record the app version, device/OS, balances, transaction classification, and relevant hashes. Mark ordinary restart and fresh import separately as pass/fail/blocked. Do not include secrets in notes.

App recovery changes chain state. To test fresh import against an independently untouched setup, repeat the scenario after cleanup. A fresh import after a successful restart recovery is a history-restoration check, not a second test of the original funded setup.

Export JSON before cleanup. `chainEvidence`, transactions, and balances describe what the tool observed. `manualAppResults` contains your separate verdicts; the tool never automatically marks the app as passing. Reports exclude keys, words, signed transaction bytes, and arbitrary network error bodies.

Finish observation and close the app, then unlock cleanup. Return funds only from tool-created HTLCs. Before expiry the cosigner must permit the early proof; near expiry it can refuse, so wait until chain time passes expiry and use the owner timeout proof. Return remaining spam-wallet funds if desired. Wait for confirmation and zero contract balances before clearing the run. Zero balances after app recovery need no additional drain.

## Verification commands

```sh
pnpm --dir tools/htlc-lab lint
pnpm --dir tools/htlc-lab typecheck
pnpm --dir tools/htlc-lab test
pnpm --dir tools/htlc-lab build
```

Protocol tests use the installed core library. Runner tests cover ordering, funding, confirmation barriers, cancellation, rate/in-flight limits, cleanup guards, and report separation. Browser checks use Playwright. Native app verdicts remain manual. Controlled reorgs, RPC fault injection, and synthetic incomplete history are outside this version.

See [VALIDATION.md](VALIDATION.md) for the recorded live testnet results and verification limits.


## Normal deposits

Use **Test a normal deposit** after loading both wallets and connecting. Fund the spam wallet; enter the deposit amount in NIM (up to five decimals) and fee in Luna. Review one transfer from the spam wallet to the imported app wallet. The app can remain open to test its live incoming listener, or be reopened after confirmation to test discovery.

Wait for confirmation before another deposit. Uncertain transfers stay in the ledger; recheck/rebroadcast uses the identical hash. Record the app's observed balance and receipt in the report notes. Export is available even while a transfer is unresolved. Clear the deposit session only after all transfers resolve, then start an HTLC scenario. Deposits are blocked during HTLC runs to preserve their controlled history. Sent deposits belong to the app wallet; clearing the session only removes local tracking.

All amount inputs, balances, totals, and transaction values use NIM; fees use whole Luna. Report version 2 declares these units and exports amounts in NIM. Earlier version 1 reports used Luna for amounts. Chain signing still uses integer Luna internally.


## Existing HTLCs before a scenario

Every HTLC scenario starts with a paginated scan of the imported wallet and its HTLC extension history. Empty historical contracts are skipped. Funded contracts whose owner is the imported wallet appear in the preflight table. Review each claim back to the app wallet, using the configured fee in Luna. Before expiry the cosigner must accept the claim; otherwise wait for its spending window or expiry, then retry. After expiry the owner timeout proof is used.

The tool waits for each claim to confirm and its live balance to become zero. It then offers creation of test HTLC A, rescanning first. Failed or incomplete discovery blocks new test funding. An uncertain claim stays tracked; do not replace it. Keep Nimiq Pay closed throughout preflight and setup. This preflight explicitly includes existing wallet-owned HTLCs; later scenario cleanup remains limited to the tool-created test contracts. Claims and discovered addresses are included in reports.


## HTLC inventory

Use **App wallet HTLCs → Find / refresh HTLCs** after connecting. The table includes funded and empty contracts from wallet and extension history, with current balances in NIM, expiry, and status. Scanning does not claim funds. Transaction listeners update known balances; scan again to discover contracts created outside this tool. A failed scan preserves previous results and their scan timestamp.
