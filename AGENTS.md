# CLAUDE.md

Common mistakes, gotchas, and confusion points in this project. If something surprises you, alert the developer and add it here. If unsure, ask — don't assume.

## Collaboration

- Unsure about anything? Ask the developer.
- Stuck? Ask the developer to guide you.

## Simplicity

- Keep it simple. No extra functions/components unless needed (dedup only); ask before adding one.
- No wrapper functions that only forward with fixed args (e.g. `function securePendingNow() { handleFunds(true) }`). Call the target directly at the call site (e.g. `@click="handleFunds(true)"`).

## Tooling & commands

- Use `pnpm` for dependencies and scripts.
- Run `pnpm lint` and `pnpm typecheck` after any change.
- Don't touch `*.po` files — auto-generated. Update via `pnpm i18n:extract`.

## Naming & terminology

- Use `isNimiqAsset` (not `isNimAsset`) to check if the active asset is NIM.
- Always write "Mini Apps" (capitalized, two words). Never "mini-apps", "miniApps", "mini apps", "app", or any variation.

## Comments

- Comment only complex/non-obvious code. Concise, explain *why* not *what*.

## Vue & components

- Sibling blocks of the same currency: wrap in one `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the condition per block.
- Reuse existing components before creating new ones.
- `Flow.vue` keeps visited steps mounted in `historyStack`. When wiring step handlers (`done`, `select`, `skip`, `back`, `navigateTo`), always validate the emitting step is still the active step before changing flow state.
- Animations: prefer `motion-v` (use the `motion` skill).

## JavaScript & TypeScript pitfalls

- Never `arr.forEach(async ...)`: the callback is fire-and-forget, so inner awaits aren't awaited by the loop. Use `for (const x of arr)` (sequential) or `await Promise.all(arr.map(async ...))` (parallel).
- `Array.prototype.concat` returns a new array, doesn't mutate. To grow an existing local array, use `arr.push(...other)` — `arr.concat(other)` silently discards the result.
- Don't add a base interface + `extends` wrapper just to add one field to most variants of a union (e.g. `ChainScoped extends MiniAppBase { network }`). If only a minority opt out, keep the base minimal and inline the field per variant via intersection. Extension only pays off when reused in more than one place or carrying multiple shared fields.

## Testing

- New feature or big UI change: check for existing tests; if none, add tests covering it. Maestro for e2e — in `nimiq-pay-tests`.
- Don't run test all the time. Run tests only when you are about to commit or when you are debugging a test failure. Don't run tests after every change, it slows down development and is unnecessary.

## Nimiq client & sync

- Client listeners (`client.addTransactionListener`, `client.addHeadChangedListener`) return a numeric ID and must be cleaned up via `client.removeListener` before re-registering. Anything registered inside a store action that can run more than once (e.g. logout → login) must capture the ID and remove the previous one first; see the `watch(remoteAddress, ...)` block in `src/stores/sync.ts` for the canonical pattern.
- On login/sync paths, hydrate UI state from the local DB cache (e.g. `useTransactions().refreshFromDb()`) before any network call. Never show an empty list while waiting for consensus when the data is already on disk.

## Data & schema

### SQLite statement batches

Every `executeSet` / `runSet` entry needs `values`, including `values: []` for statements without parameters. The TypeScript type allows omission, but Android throws `ExecuteSet: No value for values`.

### Transaction messages

Transaction messages are limited to 64 bytes: up to 64 ASCII characters, or fewer multibyte Unicode characters

### SQLite migrations — additive only

Never modify an existing `CREATE TABLE` query in `src/lib/sql-queries.ts` (or anywhere else) to add/remove/rename columns. Existing users already ran the original `CREATE TABLE` in an earlier migration, so editing it only changes the schema for fresh installs and produces a divergent state that breaks subsequent `ALTER` migrations (e.g. "duplicate column name" on fresh installs because the column is added twice — once in the edited CREATE, once in the ALTER).

To evolve a table, leave its `Create*Table` query untouched and add a new `ALTER TABLE` query plus a new migration entry with a bumped `toVersion`. Same rule applies to indexes/triggers — additive migrations only.

### Fiat enum — dual update

When adding a new currency to the `Fiat` enum in `src/stores/app.ts`, the same value must also be added to the Mini App SDK in `mini-app-sdk/` so Mini Apps consuming the host's fiat type stay in sync. Warn the developer about this dual-update requirement whenever modifying the `Fiat` enum — do not silently update only one side.

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
- **Cross-network leftover** (foreign address active in DB after switching networks): grep `⚠️ publicKey mismatch`. The DevModal switch flow purges `remote_signers`, `swap_htlcs`, `swap_quotes`, `transactions`, NAKA — anything else network-scoped (e.g. KV keys) needs to be added there.
