# Validation — 2026-09-08

## Automated checks

- Tool: 53 tests passed; lint, typecheck, and production build passed.
- Current app checkout: 80 test files / 726 tests passed; lint and typecheck passed. Old `.claude/worktrees` copies and the separately tested tool were excluded from root test discovery.
- Playwright: wallet import/validation, generated-wallet controls, network connection, transaction review, report download, and desktop/mobile layout checked. No horizontal overflow at 390px width.

## Live testnet checks

Used generated, faucet-funded accounts with `@nimiq/core` 2.20.0 and the testnet cosigner. HTLC amounts were 1,000 Luna and fees zero. Short expiry was one minute for validation; the UI defaults to five minutes.

All four chain setups passed. All tracked funding, drain, and cleanup transactions confirmed. Every created HTLC ended with zero balance. The history-bomb sender's remainder was returned to its owner.

- **Two funded HTLCs:** both balances and cosigner recognition verified before cleanup.
  - A: `abf8afc78f434e824594767e1f3e093ce15e4575bb43e7e5ad1c3d454f93f36f`
  - B: `6c9364d6a939ac9b299b32156feb99e1267dbad8ba0df1cac83533fdbba4a82a`
- **Drained old HTLC:** A was drained through the cosigner before B was created; B was then cleaned up.
  - A: `928003ef0474f7c49028ab823bab7b8e24eceb782900a116f6eb176d86edc78e`
  - B: `68e8e46aa9755b1187e64cdd4f26f7957dbd6f20424773feb38ffdb24d59754a`
- **Expired HTLC:** funded A passed its expiry, then owner timeout cleanup confirmed.
  - A: `3491e4f9ad58995d13b8af7b3916439f37a876d126c0e5ed9f5a64bf2e4c9b63`
- **History bomb:** 101 unique 1 Luna receipts confirmed after A's expiry and before B's creation. A was 106 entries behind the newest transaction; the scan crossed the 100-entry page boundary and verified every spam hash between B and A. Other scenarios shared this generated account, so a few additional test transactions also appeared in history.
  - A: `eece1c566f9bc70c7ba7a099043abf6d6a885b55e72a416e26b7d95f004bb24e`
  - B: `0dc2025965f060b3452156971dd1d2b45455f2c77304968e191a41e97fcc020a`
  - Twelve initially unresolved hashes were rebroadcast unchanged after checking chain history. No replacement hashes or additional spam transfers were created. The live queue reached and respected its 20-unresolved limit.

The UI default of 250 transfers remains unchanged. The live pagination run used 101; unit tests additionally cover a 250-entry history scan.

## Verification limits

Native app recovery and history display were **not** automatically tested. Reports explicitly marked both app verdicts blocked/manual. Use the operator checklist to verify ordinary restart and fresh account import on the intended app build.

The mainnet cosigner status/network response was checked; no mainnet funds were broadcast. Fault injection, reorg simulation, and controlled incomplete-history responses remain outside this version.

## Dashboard review

Impeccable review retained the existing operator layout. Fixed helper-text contrast, keyboard access to scrollable tables, progress labeling, mobile dialog scrolling, and ambiguous unsynced balances. Funding reserves now appear beside scenario controls, including B's reserve and spam fees. Reports and verdicts stay disabled until a run exists; paused state and chain-time expiry waits have explicit labels.

Five component tests cover scenario selection and fee budgets, empty-report guards, pause/cancel during pending reads, observation cleanup locks, and unsynced balance labels. Playwright checked desktop and 390px mobile layouts, changing fee totals, disabled empty export, dialog focus/Escape, and a simulated funded-contract table with cleanup locked. No new chain broadcasts were performed during this UI review. All four underlying scenario flows, manual verdicts, retry controls, and cleanup remain available.

Wallet persistence: local-storage save/restore, clearing without interrupting loaded wallets, corrupt data, denied writes, and generated spam-wallet address derivation are covered by tests. Wallet phrases now persist locally by operator request; reports still exclude them. Run state remains session-only.

Normal deposits: tested exact NIM-to-Luna conversion, spam-wallet signing and distinct hashes, amount-plus-fee checks, uncertain submission tracking, pending-send and HTLC isolation guards, and deposit report controls. Playwright checked desktop/mobile inputs, review total, and Escape cancellation without broadcasting. The new deposit flow has not received a separate live on-chain/app validation.

Listener updates: head and transaction listeners now invalidate block/balance snapshots, with consensus/reorg refresh and listener cleanup on replacement/unmount. Background reads no longer set the shared action busy flag. Unit tests cover idle ticks without chain polling, slow reads without locking controls, and late listener registration after teardown. A live testnet browser check observed advancing heights over eight seconds while reconnect/faucet controls remained enabled. Unresolved transaction confirmation checks still run separately because inclusion listeners do not guarantee final confirmation.

2026-09-09 preflight: all four scenarios now scan and claim existing wallet-owned funded HTLCs before creating test A. Tests cover zero owner balance before claims, confirmation plus zero-balance gates, repeat discovery, failed scans, uncertain claims, pagination, drained extension traversal, and foreign-owner exclusion. Browser checks used simulated state to verify claim amounts in NIM, fees in Luna, cancellation, and mobile layout. No live pre-existing wallet funds were moved in this validation.
