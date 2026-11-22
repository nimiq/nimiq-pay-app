---
name: trust-web3-provider
description: 'Use when changing the Nimiq Pay Mini Apps provider in `vendor/trust-web3-provider` (nimiq/trust-web3-provider, branch `nimiq`), moving its submodule pin, deciding whether a PR needs an SDK release, publishing `@nimiq/mini-app-sdk` to npm, or bumping the demo Mini App''s SDK version. Triggers - "does this PR need an SDK PR?", "publish / release the SDK", "new SDK version published, update the PR", "bump the demo", "move the provider pin". Works the same from Claude Code and Codex.'
---
# Mini Apps provider and SDK

## Layout

- `vendor/trust-web3-provider`: submodule of `nimiq/trust-web3-provider`, branch `nimiq` (fork of Trust Wallet provider). Pin rules + stale-checkout trap: CLAUDE.md "Mini Apps provider submodule".
- **Injected provider:** `pnpm build:web3-provider` (`scripts/build-web3-provider.mjs`) builds `packages/core`, `nimiq`, `ethereum` with pinned Bun (`node_modules/.bin/bun`), then `web3-provider/` bundles bridge Mini Apps get. Run after any provider change.
- **SDK:** `packages/mini-app-sdk` = `@nimiq/mini-app-sdk` on npm: types + helpers Mini Apps import. Not in injected bundle.
- **Demo Mini App:** `mini-app-sdk/dapp` in this repo, pinned to published SDK version.
- **Host side:** `web3-provider/src/` + host handlers in `src/` (search `useMiniAppHost`).

## Does a change need an SDK release?

| Change | Needs |
|---|---|
| Only `packages/core`, `nimiq` or `ethereum` (injected code) | Provider PR, then pin bump in app PR. No SDK release. |
| Mini App-facing API: new method, `window.nimiqPay` field, error shape or limit | SDK types in `packages/mini-app-sdk`, SDK release, demo bump, then nimiq/developer-center docs PR merged after app release ships it |
| `Fiat` enum | Dual update, see CLAUDE.md "Fiat enum" |

Say which row applies, with files that decide it.

## Change provider code

1. Branch in submodule, or in clone at `~/nimiq/trust-web3-provider`. PR to `nimiq/trust-web3-provider`, base `nimiq`.
2. Test: build core first (`cd packages/core && bun run build:source`), then `bun test packages/mini-app-sdk packages/nimiq`. Use app's pinned Bun if `bun` not on PATH: `<pay-repo>/node_modules/.bin/bun`.
3. After merge, app PR moves pin to merge commit: commit `chore(deps): update trust-web3-provider to <sha>`, then `pnpm build:web3-provider`.

## Publish @nimiq/mini-app-sdk

User publishes — npm needs their login + 2FA. Prepare everything, then hand over command.

1. SDK change merged on `nimiq`, incl. version bump in `packages/mini-app-sdk/package.json` (commit `chore: publishing vX.Y.Z`). `npm view @nimiq/mini-app-sdk version` shows lower version. Bump missing → goes through PR on `nimiq/trust-web3-provider`; ask before opening.
2. Build in `~/nimiq/trust-web3-provider`: `git switch nimiq && git pull --ff-only`, `git status --porcelain` empty, `bun install --frozen-lockfile`, then, in order:
   ```
   (cd packages/core && bun run build:source)
   (cd packages/nimiq && bun run build:source)
   (cd packages/mini-app-sdk && bun run build:source)
   ```
   No `prepublishOnly`, so `npm publish` ships `dist` exactly as built. Rebuild after any SDK code change. Check with `npm pack --dry-run` in `packages/mini-app-sdk` (version + file list).
3. User runs `cd packages/mini-app-sdk && npm publish --access public`.
   - Never `bun run publish`: publishes every package.
   - Never `Build Packages` workflow (`build.yml`): Trust's upstream setup, publishes `@trustwallet` packages from `main` to GitHub registry.
4. Confirm `npm view @nimiq/mini-app-sdk@X.Y.Z version`. 404 → check publish output for 2FA or auth error.
5. In app repo, on PR needing new SDK (or new branch):
   - Move pin to published commit: `git -C vendor/trust-web3-provider fetch origin nimiq && git -C vendor/trust-web3-provider checkout <sha>`, `git add vendor/trust-web3-provider`, commit `chore(deps): update trust-web3-provider to <sha>`, then `pnpm build:web3-provider`.
   - Bump `@nimiq/mini-app-sdk` in `mini-app-sdk/dapp/package.json`, run `pnpm --dir mini-app-sdk/dapp install`, commit `chore(mini-apps): bump demo SDK to X.Y.Z`. Show any new host field in demo if change added one.
6. Docs: new/changed API → developer-center PR (other repo: ask first), merged after app release that ships it.