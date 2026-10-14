# nimiq-pay-tests

Maestro e2e flows for Nimiq Pay. This folder is zipped and uploaded to BrowserStack (`scripts/browserstack-maestro-upload.js`), so keep secrets and large files out of it. Only `.yaml`, `.yml`, `.js`, images and `.mp4` go into the zip: BrowserStack rejects the whole suite if it holds any other file type (this file is left out).

## Layout

- `flows/francisco_tests/`: the suite CI runs on BrowserStack, one build per flow (`.github/workflows/maestro_browserstack_suite_only.yml`). Every flow starts from a fresh wallet.
- `flows/*.yaml` (top level): older flows that assume an already set-up wallet with history (`subflows/launch_app.yaml`). Not run in CI.
- `subflows/`: shared steps. `create_account.yaml` wipes app data and creates a wallet with `${PIN}`.
- `pageObjects/android/mainFlowsAndroid.page.js`: every selector, loaded with `runScript` and used as `${output.<screen>.<element>}`. Its comments explain past fixes (shadow DOM search box, anchored regexes).

## Writing flows

- Header: `appId: ${APP_ID}`, tag `franciscoTest`, then `runScript` of the page objects and `runFlow: ../../subflows/create_account.yaml`. Setup/Login flows start with `launchApp: clearState: true` instead, since Login only exists before a wallet is created. Never hard-code the app id or `'1111'`; use `${APP_ID}` and `${PIN}`.
- Maestro sees visible text, `aria-label` and HTML `id` of the WebView. It does not see `data-testid`. Selectors depend on English UI text.
- Network-bound UI (consensus, cosigner, Mini App list, prices) needs `extendedWaitUntil` with a realistic timeout (30 s+ for consensus/cosigner), not `assertVisible`.
- `runFlow: when: visible` is only for screens that may or may not appear (biometrics, notifications, Chrome sign-in). Never wrap the assertion that proves the feature worked, and never use `optional: true` on it.
- Assert the result of the action (new state, new screen, new list entry), not only that a button exists.
- Relative selectors don't pick the nearest element. `below`/`above`/`leftOf`/`rightOf` only compare the top-left `y` or `x` and narrow the matches; without `index`, Maestro takes the first match in hierarchy order (on the backup words, `rightOf: "03"` returned word 01). `index` sorts by top, then left. Source: `Filters.kt` and `Orchestra.buildFilter` in mobile-dev-inc/maestro.
- WebView content outside the viewport stays in the hierarchy with zero-height bounds clamped to the WebView edge (visibility 0/0 = NaN slips past Maestro's out-of-bounds filter). So `assertVisible` and `extendedWaitUntil visible` pass for content below the fold, while `tapOn` aims at the edge and misses. Before tapping something that may be below the fold, or to prove it is really on screen, use `scrollUntilVisible`, which rejects zero-height bounds. Seen on the What's New "Previous versions" button (2.20.0 changelog, Pixel_8 and Galaxy S26).
- Every command re-queries the screen. A value read over several commands (e.g. the 12 recovery words) can mix two screen states; read it until two passes agree (`subflows/capture_recovery_words.yaml`).
- BrowserStack runs Maestro 2.6.1 (pinned in the workflow; the newest it offers). The local CLI may be newer: avoid commands or options added after 2.6.1, and never set `jsEngine: rhino` (removed in 2.6.1).
- New flows join the suite tagged `quarantine` and are promoted after 10 green BrowserStack runs in a row.

## Running

- Locally: `maestro test nimiq-pay-tests/flows/francisco_tests/<flow>.yaml --env APP_ID=com.nimiq.pay.debug --env PIN=1111`, or the Maestro MCP `run` tool with `files`.
- Flows tagged `needsTestnetWallet` import the shared funded testnet wallet from `MAESTRO_TESTNET_WALLET_WORDS`. Locally, run them with `scripts/maestro-local.sh` (same arguments as `maestro`), from the repo root: it exports the `MAESTRO_*` lines of the gitignored `.env`. Maestro's debug and test output (`maestro.log`, `commands*.json`) record the typed words, so the wrapper sends whichever of `--debug-output` / `--test-output-dir` you don't pass to a temporary folder it deletes; treat folders you pass as secret. Don't run these flows while CI may be using the same wallet (logins can extend its HTLC). CI skips these flows while the repo secret is unset.
- `subflows/switch_to_testnet.yaml` opens the dev modal by holding the menu's Settings row at a measured point when `DEV_MODAL_HOLD_DEVICE` names the device (`-e DEV_MODAL_HOLD_DEVICE=Pixel_8` locally; CI passes its BrowserStack device). Otherwise it falls back to repeated `longPressOn`, which races the app's 3 s threshold (5 hits in 15 presses on the Tab S9). A new device needs its point measured (`maestro hierarchy`, the Settings row bounds) and a branch in the subflow.
- The shared testnet wallet must keep at least 10 NIM: below that the home balance always shows decimals (`settings_nim_decimals`).
- One flow on BrowserStack (costs a session): `node scripts/browserstack-maestro-run.js --app NimiqPayAndroidApkDebug --suite francisco_tests --device "Samsung Galaxy S26-16.0" --flow flows/francisco_tests/<flow>.yaml --env APP_ID=com.nimiq.pay.debug --env PIN=1111 --maestro-version 2.6.1 --output <dir>`. For `needsTestnetWallet` flows add `--secret-env MAESTRO_TESTNET_WALLET_WORDS --env "DEV_MODAL_HOLD_DEVICE=Samsung Galaxy S26-16.0"`: the script reads the value from the environment or `.env` and masks each word in the evidence, failing step and reports. Screenshots are not masked (they can show the words on the Login screen).
- The run script refuses a wallet whose words also appear in this folder's flow and page-object text (full-line comments excluded), its file paths, the run options or Maestro/log/BrowserStack wording, because masking them would corrupt evidence and reveal them in public reports. So a new selector, label or flow file name can make CI refuse the wallet flows: the flow records `NOT_RUN`, and the job log's `::error::` names the sources (never the words). Reword the source, or rotate to a new wallet. The current wallet passed on 2026-10-09.

## When a run fails

Each flow's `result.json` has an `outcome`:

| Outcome | Meaning |
|---|---|
| `PASSED` / `PASSED_ON_RETRY` | Green. A retry only happens after a BrowserStack/CI infrastructure signature |
| `INTERMITTENT` | Failed, then passed the diagnostic rerun. Not green: possibly a real intermittent app bug |
| `DETERMINISTIC` | Failed twice at the same step |
| `INFRA` / `HARNESS` | BrowserStack or our CI/config failed (see `signal`) |
| `APP_BUG` / `TEST_BUG` | Crash logs captured, or the flow launches the wrong app id |
| `UNKNOWN` | Not classifiable by the rules |
| `NOT_RUN` | Skipped: circuit breaker, fatal harness problem, time budget, unset secret, or a secret sharing words with the suite |

`/triage-maestro-run <GitHub run id>` diagnoses every non-passing flow from its evidence (shadow mode, writes `triage.md`). The rules live in `scripts/browserstack-maestro-run.js`; see "Maestro on BrowserStack" in the root `CLAUDE.md`.
