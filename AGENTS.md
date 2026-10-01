# CLAUDE.md

Common mistakes, gotchas, and confusion points in this project. If something surprises you, alert the developer and add it here.

## Collaboration

- Keep going when no input is needed. Stop and ask only when blocked, when requirements are ambiguous, or before destructive actions.

## Simplicity

- Keep it simple. No extra functions/components unless needed (dedup only); ask before adding one.
- No wrapper functions that only forward with fixed args (e.g. `function securePendingNow() { handleFunds(true) }`). Call the target directly at the call site (e.g. `@click="handleFunds(true)"`).

## Tooling & commands

- Use `pnpm` for dependencies and scripts.
- Run `pnpm lint` and `pnpm typecheck` after finishing a change, before reporting done.
- Don't touch `*.po` files — auto-generated. Update via `pnpm i18n:extract`.

### Mini Apps provider dependency in CI

- `web3-provider/package.json` links to the sibling `../trust-web3-provider` checkout. CI builds the commit pinned in `.github/actions/setup-provider/action.yml`, so local tests can pass with newer provider code while CI fails.
- When a change needs new provider code, update that CI pin in the same PR to a full commit SHA available in `nimiq/trust-web3-provider`. Publishing a new SDK version or updating the demo dependency does not update this pin.
- Verify against that exact provider commit: build `core`, `nimiq`, then `ethereum` using the action's commands, rebuild the injected bridge, and run lint, typechecks, and the full unit suite. For missing provider methods or unexpected RPC calls in CI, check the pin before changing tests or mocks.

## Naming & terminology

- Use `isNimiqAsset` (not `isNimAsset`) to check if the active asset is NIM.
- Always write "Mini Apps" (capitalized, two words). Never "mini-apps", "miniApps", "mini apps", "app", or any variation.

## Comments

- Comment complex/non-obvious code. Concise, explain *why* not *what*.

## Vue & components

- Sibling blocks of the same currency: wrap in one `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the condition per block.
- Reuse existing components before creating new ones.
- `Flow.vue` keeps visited steps mounted in `historyStack`. When wiring step handlers (`done`, `select`, `skip`, `back`, `navigateTo`), always validate the emitting step is still the active step before changing flow state.
- Animations: prefer `motion-v` (use the `motion` skill).

## Testing

- New feature or big UI change: check for existing tests; if none, add tests covering it. Maestro for e2e — in `nimiq-pay-tests`.
- Run tests only before committing or when debugging a test failure.

## Nimiq client & sync

- `executionResult` is not failure-only: `true` means execution succeeded, `false` means execution failed. Missing/`undefined` means no result was provided; never assume success from absence.
- In core-rs-albatross commit `13b24b5de83aeb52c02304c1237acef68a228d10`, `getTransaction(hash)` fetches blockchain history and provides `executionResult` for both outcomes. `sendTransaction()` can return state `new` without an execution result when inclusion has not been observed. If a direct `getTransaction()` response lacks it, check the exact method, package version, and response before drawing conclusions. Source: https://github.com/nimiq/core-rs-albatross/blob/13b24b5de83aeb52c02304c1237acef68a228d10/web-client/src/common/transaction.rs#L1223-L1281

- Register incoming transaction listeners before slow signer verification. Local receipts must not wait for pending HTLCs, older history pages, or an unchanged remote signer address.

- Confirmed HTLC creation value is historical, not the current balance. Read the live account before recovery activation; resolve drained creations without restoring their funds or replacing a newer signer.

- Cosigner block-based wallet registration can return `creatingTransactionHash: null`. Recover creation from blockchain history and validate its HTLC details before activation.
- Cosigner `validityStart` is the height at which spending is allowed (includes confirmation delay). It is not the creating transaction's `validityStartHeight`; never compare them for equality.
- Cosigner `txSent: false` includes broadcast RPC timeouts. Keep the staged transaction unresolved; false does not prove it was never broadcast.

- Client listeners (`client.addTransactionListener`, `client.addHeadChangedListener`) return a numeric ID and must be cleaned up via `client.removeListener` before re-registering. Anything registered inside a store action that can run more than once (e.g. logout → login) must capture the ID and remove the previous one first; see `registerWalletListeners` in `src/stores/sync/lifecycle.ts` and `init` in `src/stores/remote-signer.ts` for the canonical pattern.
- On login/sync paths, hydrate UI state from the local DB cache (e.g. `useTransactions().refreshFromDb()`) before any network call. Never show an empty list while waiting for consensus when the data is already on disk.

## Data & schema

### SQLite statement batches

Every `executeSet` / `runSet` entry needs `values`, including `values: []` for statements without parameters. The TypeScript type allows omission, but Android throws `ExecuteSet: No value for values`.

`useConn().query(..., { single: true })` returns a row object, not a scalar. Read the selected column from that row.

### Transaction messages

Transaction messages are limited to 64 bytes: up to 64 ASCII characters, or fewer multibyte Unicode characters

### SQLite migrations — additive only

Never modify an existing `CREATE TABLE` query in `src/lib/sql-queries.ts` (or anywhere else) to add/remove/rename columns. Existing users already ran the original `CREATE TABLE` in an earlier migration, so editing it only changes the schema for fresh installs and produces a divergent state that breaks subsequent `ALTER` migrations (e.g. "duplicate column name" on fresh installs because the column is added twice — once in the edited CREATE, once in the ALTER).

To evolve a table, leave its `Create*Table` query untouched and add a new `ALTER TABLE` query plus a new migration entry with a bumped `toVersion`. Same rule applies to indexes/triggers — additive migrations only.

### Fiat enum — dual update

When adding a new currency to the `Fiat` enum in `src/stores/app.ts`, the same value must also be added to the `Fiat` enum of the published `@nimiq/mini-app-sdk` package (source: `packages/mini-app-sdk/types.ts` on the `nimiq` branch of `nimiq/trust-web3-provider`) so Mini Apps consuming the host's fiat type stay in sync. Warn the developer about this dual-update requirement whenever modifying the `Fiat` enum — do not silently update only one side.

## Android release R8

Release uses `proguard-android-optimize.txt`. With optimization on, R8 folds reads of annotation types that no rule keeps to `null`. Capacitor's `PluginHandle.getPluginAnnotation()` then returns null and `checkPermissions` crashes with an NPE. `android/app/proguard-rules.pro` keeps the Capacitor annotation interfaces; don't remove them. After R8 rule or plugin changes, install a release build and exercise permission flows (push toggle, biometrics, camera). Debug builds are not minified and won't show this.

## CSS — teleported/portaled elements

Anything teleported/portaled to `document.body` (Vue `<Teleport>`, Reka UI `DialogPortal`, etc.) renders invisible by default: `src/theme/variables.css` has `body>div:not(#app) { z-index: -100 }` (keeps the camera-preview web video behind the app), and the `:not(#app)` gives it id-level specificity that beats any utility class like `z-[99999]`. Set the z-index via inline `style` on the portaled element instead (inline wins; the rule has no `!important`) — see `MiniAppActionsSheet.vue`. Don't widen or delete the camera rule.

## Debugging on device

For runtime/sync/HTLC bugs, on-device behavior questions, "why did it skip", "logs show X", or any "check the device":

- Activate the **`debugging-capacitor`** skill (loads platform-specific log/debugger guidance for both iOS and Android — Capacitor projects only).
- Pull persisted app logs (these contain `logger.log`/`logger.warn`/`logger.error` from `useLogger`):
  ```
  adb shell run-as com.nimiq.pay.debug cat cache/logs.txt > /tmp/nimiq-logs.txt
  ```
  iOS equivalent path: app sandbox `Library/Caches/logs.txt`. The persisted file is flushed every ~30s by `useLogger`, so the latest few seconds may only be visible via live logcat.
- Live-stream WebView console + native:
  ```
  adb logcat -d --pid=$(adb shell pidof com.nimiq.pay.debug) | grep "Capacitor/Console"
  ```
- The SQLite DB at `databases/storageSQLite.db` is **encrypted** (CapacitorSQLite + SQLCipher) — do not try to `sqlite3` the file directly, it will return "file is not a database". Inspect state through logger output instead.

### Grep templates for `cache/logs.txt`

The sync/transactions/remote-signer paths emit emoji-prefixed events at every silent decision point. Use these to diagnose without re-reading the code:

| Grep | What it tells you |
|---|---|
| `grep -E "🚫.*own-HTLC"` | Listener / `addReceiptTransaction` correctly dropped a drain from one of our own HTLCs (sender in `remote_signers`). |
| `grep -E "♻️.*replacing"` | `addTransaction` collapsed an in-memory duplicate (same hash already present). Includes both transfer types — useful when a tx is racing through multiple paths. |
| `grep -E "🧹 filterDisplayableTxs dropped"` | Read-side filter (`selectTxs` / `refreshFromDb`) removed an own-HTLC `UserReceipt` already in DB. Lists hashes. |
| `grep -E "🧹 filterUnseen"` | Recursive HTLC traversal filter dropped reclaim-to-local txs and dup hashes. Tags origin as `outer:<addr>` or `nested:<addr>`. |
| `grep -E "📦 categorize"` | Per-remote-signer bucket distribution from `categorizeTransactions` (htlcExt/swap/withdraw/staking/unknown counts). Sanity-check whether traversal is finding what you expect. |
| `grep -E "💸 addUnknownPaymentToMerchantTransaction"` | A tx is being recorded as a Payment by `handleUnknownTxs`. If you see one whose `senderType: 2` (HTLC) and sender is your own remote signer, that's a categorization bug. |
| `grep -E "🔄.*cache rebuilt"` | `getOurRemoteSignerAddresses` rebuilt its in-memory cache. Should fire after every `addRemoteSigner`/`updateRemoteSigner`/`discoverRemoteSignersFromBlockchain` insert. Missing rebuild = stale guard set. |
| `grep -E "⚠️.*publicKey mismatch"` | Stored remote signer's cosigner publicKey ≠ API response's. Almost certainly cross-network stale state (testnet signer left over after switching to mainnet, or vice versa). |
| `grep -E "All Transactions from Blockchain"` | `discoverRemoteSignersFromBlockchain` reached the chain query and returned. **Absence after `Verifying remote signers in DB` means the chain query stalled** — a 30s timeout aborts and lets the periodic head listener retry. |
| `grep -E "🧬 Starting to sync wallets"` | `syncWallets` made it past `verifyRemoteSignersDb`. If missing, sync is wedged earlier and listeners + periodic refresh never started — that's why home appears empty. |
| `grep -E "📚 Upsert-ing transaction"` | DB write happening. Compare count in fresh session against expected tx count to catch missing ingest. |

### Common diagnoses

- **Empty home list after fresh start**: check `🧬 Starting to sync wallets` is logged. If not, `syncWallets` is wedged on `verifyRemoteSignersDb` → `discoverRemoteSignersFromBlockchain`. The 30s timeout in `runDiscoverRemoteSignersFromBlockchain` should unblock; if it keeps tripping, the testnet light client history isn't ready yet — wait or reload.
- **Stale tx duplicated as different titles** (e.g., same hash showing as both "Top-Up" and "Payment"): grep `♻️ replacing` for that hash. The dedup catches the in-memory dupe; the underlying multi-path write is the deeper bug — trace which paths hit the same hash via `🚫`/`💸`/`📦` logs.
- **Cross-network leftover** (foreign address active in DB after switching networks): grep `⚠️ publicKey mismatch`. The DevModal switch flow purges `remote_signers`, `swap_htlcs`, `swap_quotes`, `transactions` — anything else network-scoped (e.g. KV keys) needs to be added there.
