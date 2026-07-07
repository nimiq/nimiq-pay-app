The role of this file is to describe common mistakes and
confusion points that agents might encounter as they work in
this project. If you ever encounter something in the project
that surprises you, please alert the developer working with you
and indicate that this is the case in the AgentMD file to help
prevent future agents from having the same issue.

If you have any question, ask, don't assume! If you are unsure about something, ask the developer working with you.
Simplify everything, don't create extra functions or components if they are not needed (only do it to prevent duplicates), don't overcomplicate things, keep it simple and straightforward. If you need to create a new function or component, ask to the dev working with you.
Don't create wrapper functions that only forward to another function with fixed arguments (e.g. `function securePendingNow() { handleFunds(true) }`). Call the target directly at the call site instead (e.g. `@click="handleFunds(true)"`).
Don't touch any `*.po` file, they are auto generated. To update them, run `pnpm i18n:extract`.
Use `pnpm` to install dependencies and run scripts.
Use `isNimiqAsset` (not `isNimAsset`) as the naming convention when checking if the active asset is NIM.
In Vue templates, if multiple sibling blocks belong to the same currency, wrap them in a single `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the asset condition on every block.
If implementing a new feature, check if there are existing components that can be reused before creating new ones.
if implementing a new feature or making big UI changes, check if there are existing tests, if not, add new tests to cover the new feature or changes. Use maestro for e2e tests. You can find them in `nimiq-pay-tests`.
Add comments to code that is complex or not immediately obvious; keep them concise and focused on explaining *why*, not *what*.
`Flow.vue` keeps previously visited steps mounted in `historyStack`. When wiring step event handlers (`done`, `select`, `skip`, `back`, or `navigateTo`), always validate that the emitting step is still the active step before changing flow state.
Always execute `pnpm lint` and `pnpm typecheck` after making changes to ensure code quality and type safety.
When working with animations, prefer `motion-v` (use the `motion` skill).
Never use `arr.forEach(async ...)`: the callback is fire-and-forget so awaits inside are not awaited by the loop. Use `for (const x of arr)` for sequential work or `await Promise.all(arr.map(async ...))` for parallel.
`Array.prototype.concat` returns a new array and does not mutate. If you intend to grow an existing local array (e.g. when accumulating categorized transactions), use `arr.push(...other)` instead — `arr.concat(other)` silently discards the result.
Nimiq client listeners (`client.addTransactionListener`, `client.addHeadChangedListener`) return a numeric ID and must be cleaned up via `client.removeListener` before re-registering. Anything registered inside a store action that can run more than once (e.g. on logout → login) must capture the ID and remove the previous one first; see the `watch(remoteAddress, ...)` block in `src/stores/sync.ts` for the canonical pattern.
On login/sync paths, hydrate UI state from the local DB cache (e.g. `useTransactions().refreshFromDb()`) before any network call. The user must never stare at an empty list while we wait for consensus when we already have the data on disk.
Don't introduce a base interface + `extends` wrapper just to add one field to most variants of a union (e.g. `ChainScoped extends MiniAppBase { network }`). If only a minority of variants opt out, keep the base minimal and inline the extra field per variant via intersection. Extension only pulls weight when the wrapper is reused in more than one place or carries multiple shared fields.
When talking about "mini apps", always refer them as "Mini Apps" (capitalized, two words). Never as "mini-apps", "miniApps", "mini apps", "app", or any other variation.
SQLite schema: never modify an existing `CREATE TABLE` query in `src/lib/sql-queries.ts` (or anywhere else) to add/remove/rename columns. Existing users already ran the original `CREATE TABLE` in an earlier migration, so editing it only changes the schema for fresh installs and produces a divergent state that breaks subsequent `ALTER` migrations (e.g. "duplicate column name" on fresh installs because the column is added twice — once in the edited CREATE, once in the ALTER). To evolve a table, leave its `Create*Table` query untouched and add a new `ALTER TABLE` query plus a new migration entry with a bumped `toVersion`. Same rule applies to indexes/triggers — additive migrations only.
When adding a new currency to the `Fiat` enum in `src/stores/app.ts`, the same value must also be added to the Mini App SDK in `mini-app-sdk/` so Mini Apps consuming the host's fiat type stay in sync. Warn the developer about this dual-update requirement whenever modifying the `Fiat` enum — do not silently update only one side.
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
