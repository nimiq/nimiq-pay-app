# CLAUDE.md

Common mistakes, gotchas, and confusion points in this project. If something surprises you, alert the developer and add it here.

## Collaboration

- Keep going when no input is needed. Stop and ask only when blocked, when requirements are ambiguous, or before destructive actions.

## Simplicity

- Keep it simple. No extra functions/components unless needed (dedup only); ask before adding one.
- No wrapper functions that only forward with fixed args (e.g. `function securePendingNow() { handleFunds(true) }`). Call the target directly at the call site (e.g. `@click="handleFunds(true)"`).

## Tooling & commands

- Use `pnpm` for dependencies and scripts.
- `dotenv` scripts (`pnpm release:browserstack:apk`, …) swallow flags passed after them: `pnpm release:browserstack:apk --apk x` silently drops `--apk`. Run `pnpm exec dotenv -- node scripts/<script> --flag` instead.
- Run `pnpm lint` and `pnpm typecheck` after finishing a change, before reporting done.
- Don't touch `*.po` files — auto-generated. Update via `pnpm i18n:extract`.
- Never self-close `<textarea>` in Vue templates. `pnpm i18n:extract` parses templates as HTML, reads everything after `<textarea />` as its text, and silently drops every later `$t` string in that file. Write `<textarea ...></textarea>` inside an `eslint-disable vue/html-self-closing` block (see `LiveChat.vue`).

### CodeQL

- CodeQL scans GitHub Actions, JavaScript/TypeScript, and Ruby. Swift and Java/Kotlin scanning are intentionally disabled to save CI minutes.
- Keep GitHub default setup disabled when using the advanced CodeQL workflow; default setup rejects its result uploads.

### Mini Apps provider submodule

- `web3-provider/package.json` links to `vendor/trust-web3-provider`, a submodule of `nimiq/trust-web3-provider` (branch `nimiq`). Local builds and CI use the same pinned commit. Clone with `--recurse-submodules`, or run `git submodule update --init --recursive`.
- `pnpm install` runs `scripts/build-web3-provider.mjs`. It builds `core`, `nimiq`, then `ethereum` with the pinned Bun devDependency, then typechecks and bundles the injected bridge. Run `pnpm build:web3-provider` after changing provider code.
- A pull that moves the pin leaves the old submodule checkout in place, and the build silently uses it. Before debugging Mini Apps provider behavior, run `git submodule status`: a leading `+` means the checkout differs from the pin. Fix with `git submodule update --init --recursive`, then `pnpm build:web3-provider`.
- The build script installs `web3-provider` with `--frozen-lockfile`. After changing its dependencies, run `pnpm --dir web3-provider install` to update `web3-provider/pnpm-lock.yaml` first.
- When a change needs new provider code, move the submodule to a reviewed commit that exists on `nimiq/trust-web3-provider` in the same PR. Publishing a new SDK version or updating the demo dependency does not move the pin. For missing provider methods or unexpected RPC calls in CI, check the pin before changing tests or mocks.
- An app build without the bridge still succeeds: `public/web3-provider.js` is then a placeholder (or a stale copy) and `vite build` only logs "Failed to copy web3 provider script". Before building an APK, build the provider packages and run `pnpm build:web3-provider`, then check `assets/public/web3-provider.js` in the APK is the real bundle (~1.2 MB, not a few bytes).

## Naming & terminology

- Use `isNimiqAsset` (not `isNimAsset`) to check if the active asset is NIM.
- Always write "Mini Apps" (capitalized, two words). Never "mini-apps", "miniApps", "mini apps", "app", or any variation.

## Comments

- Comment complex/non-obvious code. Concise, explain *why* not *what*.

## Error messages

- Never interpolate an object into a template string: `` `Expected ${{ a, b }}` `` renders `[object Object]`. Use `JSON.stringify({ a, b })` or name the fields.
- The second argument of `new Error()` is `ErrorOptions` (`{ cause }`), not extra data. `new Error('msg', payload)` silently drops `payload`; put the data in the message or use `{ cause }`.

## Vue & components

- Ionic mounts modal contents before presenting the overlay. In `onMounted`, find the owning `ion-modal` from the component's DOM; `modalController.getTop()` excludes that still-hidden overlay and can return an underlying modal.
- Ionic 8.8 sets `--ion-safe-area-top: 0px` on sheet modals and puts the root value in `--ion-modal-offset-top`. Heights computed on or inside a sheet must use `var(--ion-modal-offset-top, var(--ion-safe-area-top))`: plain `var(--ion-safe-area-top)` reads 0, so the sheet grows under the status bar or its content runs off the bottom (APP-328).
- Sibling blocks of the same currency: wrap in one `<template v-if="asset === Asset.USDT">` / `<template v-if="asset === Asset.NIM">` instead of repeating the condition per block.
- Reuse existing components before creating new ones.
- `Flow.vue` keeps visited steps mounted in `historyStack`. When wiring step handlers (`done`, `select`, `skip`, `back`, `navigateTo`), always validate the emitting step is still the active step before changing flow state.
- Animations: prefer `motion-v` (use the `motion` skill).

## Testing

- New feature or big UI change: check for existing tests; if none, add tests covering it. Maestro for e2e — in `nimiq-pay-tests`.
- Run tests only before committing or when debugging a test failure.
- Vitest also discovers tests in nested `.claude/worktrees` checkouts. Exclude local agent directories with `pnpm test:unit run --exclude '**/.claude/**' --exclude '**/.codex/**'` when testing the current checkout.

### Maestro on BrowserStack

- BrowserStack's MCP server cannot see Maestro builds (its tools wrap Appium endpoints). Use the Maestro v2 REST API through `scripts/browserstack-maestro-run.js`.
- A `failed` test case is not proof of an assertion failure: real runs show ADB device loss and an unreachable Maestro driver reported as `failed`. Classify from the failing command's error (`maestro_commands`) or the failing step's log lines, never from the status alone.
- `vite build --mode development` is still mainnet (`isTestnet` follows `import.meta.env.DEV`, i.e. `NODE_ENV`). Switch test devices to testnet at runtime via the dev modal instead.
- Test APKs for the suite come from `scripts/build-test-apk.mjs`, which disables Capgo over-the-air updates; otherwise a relaunch can swap in the production web bundle mid-run.

### iOS simulator build (Maestro)

- `node scripts/build-test-ios-sim.mjs` builds `ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app` (Mini Apps on, over-the-air updates off, ad hoc signed, ~3.5 min), checks the built app, and puts back the build's rewrites of `src/i18n/en.po` and the `COCOAPODS:` line of `ios/App/Podfile.lock`. It only lists other files that changed while it ran: after a plugin change, `cap sync` updates the Podfile and pods, which need committing. Install with `xcrun simctl install booted <app>`. Simulator only: BrowserStack's real iPhones need a signed `.ipa`. With a newer local CocoaPods, the restored `Podfile.lock` no longer matches `Pods/Manifest.lock`, so a later build from Xcode fails "[CP] Check Pods Manifest.lock" until `pod install` runs in `ios/App` (the script runs it every time).
- Building by hand: `pnpm exec cap sync ios` runs `bundle exec pod install` (the repo has a `Gemfile`), which fails while the `Gemfile.lock` gems aren't installed; its `bundle` probe can first spin at 100% CPU for minutes. `CAPACITOR_COCOAPODS_PATH=pod` makes it run plain `pod install`.
- Never `CODE_SIGNING_ALLOWED=NO`: the app then lacks `application-identifier`, every Keychain call fails (`-34018`), and onboarding shows "Something went wrong decrypting the database", which looks like an app bug but isn't.

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

## OTA updates

- Our update server's "no update" reply has no `kind`, so `CapacitorUpdater.getLatest()` rejects with `no_new_version_available` instead of resolving (APP-353). Treat that rejection as a normal result.
- `set()` keeps any bundle the auto-update staged, and that bundle replaces the manual install on next background. Call `next()` with the same id first.
- Auto-update downloads and stages a bundle soon after launch, even in `atBackground` mode. To test a manual download on a device, `reset()` to builtin and `delete()` the bundle first.

## CSS — teleported/portaled elements

Anything teleported/portaled to `document.body` (Vue `<Teleport>`, Reka UI `DialogPortal`, etc.) renders invisible by default: `src/theme/variables.css` has `body>div:not(#app) { z-index: -100 }` (keeps the camera-preview web video behind the app), and the `:not(#app)` gives it id-level specificity that beats any utility class like `z-[99999]`. Set the z-index via inline `style` on the portaled element instead (inline wins; the rule has no `!important`) — see `MiniAppActionsSheet.vue`. Don't widen or delete the camera rule.

## Debugging on device

For runtime/sync/HTLC bugs, on-device behavior questions, "why did it skip", "logs show X", or any "check the device": activate the `debugging-capacitor` skill and read `docs/device-debugging.md` (log commands, grep templates, common diagnoses).
