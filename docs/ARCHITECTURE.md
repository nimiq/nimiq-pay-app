# Architecture

Nimiq Pay is a Vue 3 + Ionic app packaged with Capacitor for iOS and Android, with a browser build for development. If this page and the code disagree, the code is right.

## Repository layout

| Path | Contents |
|---|---|
| `src/stores/` | Pinia stores. `sync.ts` is a facade over `sync/` (balances, HTLCs, remote signers, transactions, lifecycle). |
| `src/lib/` | Logic without UI: transaction building (`tx.ts`), SQL schema and migrations (`sql-queries.ts`), flows, Polygon and Mini App helpers. |
| `src/composables/` | HTTP and WebSocket clients (`useApi.ts`), PIN unlock (`useDecrypt.ts`), biometrics, Mini App host, swaps, prices, notifications. |
| `src/components/`, `src/modals/`, `src/views/` | UI. |
| `src/i18n/` | gettext `.po` files. Generated, see [CONTRIBUTING.md](../CONTRIBUTING.md#making-changes). |
| `web3-provider/` | Builds the script injected into Mini Apps. |
| `vendor/trust-web3-provider/` | Git submodule with the provider packages and `@nimiq/mini-app-sdk`. |
| `android/`, `ios/` | Capacitor native projects. Custom native code is minimal. |
| `scripts/` | Provider build, OTA encryption, release and changelog scripts. |
| `nimiq-pay-tests/`, `tests/e2e/` | Maestro and end-to-end tests. Unit tests sit next to the code as `*.spec.ts`. |

## Wallet storage

The wallet stores one secret: the 16-byte entropy, under the KV key `entropy` (`src/stores/app.ts`). Keys are derived when needed (`src/stores/local-wallet.ts`):

- NIM: `m/44'/242'/0'/0'`
- EVM (USDT on Polygon, Mini Apps): `m/44'/60'/0'/0/0`

Everything is stored in one SQLite database through `@capacitor-community/sqlite` (`src/stores/conn.ts`).

On iOS and Android the database is encrypted with SQLCipher, and the PIN is the passphrase. On web it is not encrypted; the app only checks the PIN against a stored hash (see [Known issues](../README.md#database-encryption-on-web)). With biometrics on, the PIN is kept in secure storage behind biometric auth (`src/composables/useBiometric.ts`).

There are two key-value stores. `kv()` is a table in the database and works only after unlock. `kvPreferences()` uses Capacitor Preferences and holds non-sensitive settings that are needed before unlock.

Schema changes are migrations in `src/lib/sql-queries.ts`: an array of `{ toVersion, statements }` that the SQLite plugin applies on open. Migrations are additive only. Never edit an existing `CREATE TABLE`; add an `ALTER TABLE` in a new migration.

## Nimiq sync and the cosigner

The app runs the Nimiq web client (`@nimiq/core`, WASM) in pico sync mode (`src/stores/nimiq-network.ts`). Dev builds use testnet by default.

Payments don't spend from the user's normal account. They go through an HTLC that the Nimiq Pay cosigner co-signs:

1. Incoming NIM lands in the user's local address.
2. The app moves it into an HTLC shared with the Nimiq Pay cosigner. The HTLC times out after 14 days (`createDepositData` in `src/lib/tx.ts`). The app stores each HTLC as a "remote signer" (`remote_signers` table).
3. A payment spends from the HTLC with an early-resolve proof signed by both the user and the cosigner. The cosigner never holds the user's keys.
4. After the timeout the user can reclaim the funds alone. The app extends or recreates HTLCs before they expire.

The cosigner is a WebSocket service (`src/composables/useApi.ts`). Its trusted public keys are in `src/lib/index.ts`. Sync logic lives in `src/stores/sync/`. The device debugging section of `CLAUDE.md` lists the log lines each sync step emits.

## USDT on Polygon

USDT uses ethers v6 (`src/stores/polygon-usdt.ts`, `src/lib/polygon/`). Transfers are gasless through OpenGSN relays (`src/lib/polygon/opengsn.ts`). The default RPC is a public endpoint. `VITE_POLYGON_RPC_URL` overrides it.

## Flows

User journeys such as setup, login, payment and backup are flows: step-by-step state machines shown in a modal. Steps are defined in `src/lib/flows/`, rendered by `src/components/Flow.vue`, and started with `initializeFlow()`. See [`src/lib/flows/README.md`](../src/lib/flows/README.md).

## Mini Apps

Mini Apps are third-party web apps that open inside Nimiq Pay and can request accounts, signatures and payments.

The catalog comes from [`nimiq/awesome`](https://github.com/nimiq/awesome) (`src/stores/mini-apps.ts`). Opening a URL that isn't in the catalog shows an anti-scam warning first.

`@capgo/capacitor-inappbrowser` opens each Mini App in a separate WebView and injects `web3-provider.js` before the page's own scripts run (`src/lib/mini-app-launcher.ts`). That script, built in `web3-provider/` from `vendor/trust-web3-provider`, exposes `window.nimiq` and an EIP-1193 `window.ethereum`, which is also announced through EIP-6963.

Requests from the Mini App reach the host over `postMessage` (`src/composables/useMiniAppHost.ts`). The user has to confirm every sensitive request (`src/lib/mini-app-confirmation.ts`).

A Mini App can offer a home screen widget by serving `nimiq-pay-widget.json` next to its start page. After the user agrees to share their address, Nimiq Pay polls the manifest's `dataUrl` on the Mini App's own origin while home is visible and draws the JSON it returns with its own component. No webview runs for a widget (`src/lib/mini-app-widgets.ts`, `src/stores/mini-app-widgets.ts`, `src/components/MiniAppWidget.vue`). The demo Mini App in `mini-app-sdk/dapp` serves sample widget data.

Mini Apps are off unless `VITE_ENABLE_MINI_APPS` is set.

## External services

| Service | Used for | Where |
|---|---|---|
| Nimiq network | Balances, history, broadcasting | `src/stores/nimiq-network.ts` |
| Nimiq Pay cosigner | Co-signing payments from HTLCs | `src/composables/useApi.ts` |
| Points service | Cashback, referrals, tasks | `src/composables/useApi.ts` |
| Price service | Fiat prices | `src/composables/useApi.ts` |
| Crypto payment link (Firestore) | Payment link orders | `src/composables/useApi.ts` |
| Notifications feed | In-app announcements | `src/composables/useApi.ts` |
| Fastspot | Lightning swaps | `src/composables/useFastspotV1.ts`, `useFastspotV2.ts` |
| GoCrypto | Point-of-sale payments | `src/composables/useGoCrypto.ts` |
| Polygon RPC, OpenGSN relays | USDT | `src/lib/polygon/` |
| PostHog | Analytics, feature flags, error reports | `src/lib/analytics.ts` |
| Capgo updater + Cloudflare R2 | Signed OTA web bundles | `capacitor.config.ts`, [README](../README.md#over-the-air-updates-ota) |
| Firebase Cloud Messaging | Push notifications | `android/`, `ios/` |

Testnet endpoints are used when the app runs on testnet.

## What works in a build from source

The service endpoints are part of the source, so a build from source can sync, pay through the cosigner, show prices and swap without private configuration. Some parts need values that only maintainers have:

- live chat needs `VITE_WALKIE_TALKIE_URL` and `VITE_WALKIE_TALKIE_API_KEY`
- EVM chains other than Polygon need their `VITE_*_RPC_URL` for Mini Apps
- OTA publishing and store releases need Nimiq's signing keys and store accounts
- push notifications need your own Firebase project for your app ID

See `.env.example` for all build variables.
