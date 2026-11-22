# Debugging on device

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

## Grep templates for `cache/logs.txt`

The sync/transactions/remote-signer paths emit emoji-prefixed events at every silent decision point. Use these to diagnose without re-reading the code:

| Grep | What it tells you |
|---|---|
| `grep -E "🚫.*own-HTLC"` | Listener / `addReceiptTransactions` correctly dropped a drain from one of our own HTLCs (sender in `remote_signers`). |
| `grep -E "♻️.*replacing"` | `addTransactions` collapsed an in-memory duplicate (same hash already present). Includes both transfer types — useful when a tx is racing through multiple paths. |
| `grep -E "🧹 filterDisplayableTxs dropped"` | Read-side filter (`selectTxs` / `refreshFromDb`) removed an own-HTLC `UserReceipt` already in DB. Lists hashes. |
| `grep -E "🧹 filterUnseen"` | Recursive HTLC traversal filter dropped reclaim-to-local txs and dup hashes. Tags origin as `outer:<addr>` or `nested:<addr>`. |
| `grep -E "📦 categorize"` | Per-remote-signer bucket distribution from `categorizeTransactions` (htlcExt/swap/withdraw/staking/unknown counts). Sanity-check whether traversal is finding what you expect. |
| `grep -E "💸 toUnknownPaymentToMerchantTransaction"` | A tx is being recorded as a Payment by remote-signer history sync. If you see one whose `senderType: 2` (HTLC) and sender is your own remote signer, that's a categorization bug. |
| `grep -E "🔄.*cache rebuilt"` | `getOurRemoteSignerAddresses` rebuilt its in-memory cache. Should fire after every `addRemoteSigner`/`updateRemoteSigner`/`discoverRemoteSignersFromBlockchain` insert. Missing rebuild = stale guard set. |
| `grep -E "⚠️.*publicKey mismatch"` | Stored remote signer's cosigner publicKey ≠ API response's. Almost certainly cross-network stale state (testnet signer left over after switching to mainnet, or vice versa). |
| `grep -E "All Transactions from Blockchain"` | The local HTLC history scan (`runScanLocalHtlcCreations`, shared by discovery and DB verification) got one history page. **Absence after `Verifying remote signers in DB` means the chain query stalled.** Each page times out after 30s in `waitForLocalHistory`: the history client is reset, the scan logs `getTransactionsByAddress failed` and discovery returns incomplete. |
| `grep -E "📇 Cosigner"` | Cosigner `owner-wallets` listing, asked once per wallet and network per session (DevModal "Scan wallet history" reuses it). `listed HTLCs` gives the count fed to the stray sweep, which checks each one on chain before draining; `unavailable` means a failure or an old cosigner without the endpoint, retried after 5 min. |
| `grep -E "🧬 Starting to sync wallets"` | `syncWallets` made it past `verifyRemoteSignersDb`. If missing, sync is wedged earlier and listeners + periodic refresh never started — that's why home appears empty. |
| `grep -E "⚡ Swap status changed"` | Lightning swap settlement polling saw a new Fastspot status (`from`/`to`, poll count). The in-app flow keeps the PIN screen loading until the preimage arrives or the swap expires. The same steps go to PostHog as `swap_step` events, so check those first when logs are missing. |
| `grep -E "Build stamp"` | Source the running JS was built from: `<commit>` or `<commit>-<hash of uncommitted changes>`. Logged on every page load. No line = a build from before the stamp. `ship`'s `verify-build.sh` compares it to a worktree. |
| `grep -E "📚 Upsert-ing"` | DB write happening. Single writes log `Upsert-ing transaction`; history sync batches log `Upsert-ing <n> transactions` with the hashes. Sum both against the expected tx count to catch missing ingest. |

## Common diagnoses

- **Empty home list after fresh start**: check `🧬 Starting to sync wallets` is logged. If not, `syncWallets` is still waiting on `verifyRemoteSignersDb` → `discoverRemoteSignersFromBlockchain`. There is no timeout for the whole run. Each history page and each cosigner/chain lookup times out after 30s (`DISCOVER_TIMEOUT_MS`), so a stalled page ends the run as incomplete (`Remote signer discovery incomplete. Delaying reconciliation`) and sync continues. A wallet with many HTLCs can still take minutes, because metadata lookups run one by one. If history pages keep timing out on testnet, the light client history isn't ready yet: wait or reload.
- **Stale tx duplicated as different titles** (e.g., same hash showing as both "Top-Up" and "Payment"): grep `♻️ replacing` for that hash. The dedup catches the in-memory dupe; the underlying multi-path write is the deeper bug — trace which paths hit the same hash via `🚫`/`💸`/`📦` logs.
- **Cross-network leftover** (foreign address active in DB after switching networks): grep `⚠️ publicKey mismatch`. The DevModal switch flow purges `remote_signers`, `swap_htlcs`, `swap_quotes`, `transactions` — anything else network-scoped (e.g. KV keys) needs to be added there.
