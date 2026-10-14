# Nimiq Pay

Nimiq Pay is a self-custody mobile wallet for paying with NIM and USDT. It runs on
iOS and Android and is built with Vue, Ionic and Capacitor. Get it on the
[App Store](https://apps.apple.com/app/nimiq-pay/id6471844738) or
[Google Play](https://play.google.com/store/apps/details?id=com.nimiq.pay).

## Development setup

Use Node from `.nvmrc` and pnpm from `packageManager` (for example through Corepack).
Bun is installed as a pinned devDependency.

```sh
git clone --recurse-submodules https://github.com/nimiq/nimiq-pay-app.git
cd nimiq-pay-app
pnpm install
pnpm dev
```

If you cloned without submodules, run `git submodule update --init --recursive`
before `pnpm install`.

Copy `.env.example` to `.env` and fill in the values for the features you work on.

After a pull that moves `vendor/trust-web3-provider`, run
`git submodule update --init --recursive`, then `pnpm build:web3-provider`.
Otherwise the app keeps the old provider build. To update it on every pull,
run `git config submodule.recurse true` once.

## Native releases

Run `pnpm release:beta` from a clean checkout on a Mac with the existing iOS and
Android build tools and signing credentials configured. The command syncs
translations, asks which AI CLI to use for the changelog, then starts release-it.

Set `GITHUB_TOKEN` in your local `.env` or shell environment. Use a personal access
token with access to `nimiq/nimiq-pay-app` and **Contents: read and write** permission
([GitHub release permissions](https://docs.github.com/en/rest/releases/releases#create-a-release)).
Git must also be authenticated for pushing commits and tags to
`origin`, which should point to `https://github.com/nimiq/nimiq-pay-app.git`.

Release-it generates the changelog for review, builds iOS and Android, then commits
and tags the version and pushes it. It publishes the release notes and `.ipa`,
`.app.tgz`, `.aab`, and `.apk` files as GitHub release assets. After publishing, it
uploads the `.ipa` and `.aab` to BrowserStack using `BROWSERSTACK_USERNAME` and
`BROWSERSTACK_ACCESS_KEY`, then removes the local release build files.

## Over-the-air updates (OTA)

Nimiq Pay uses `@capgo/capacitor-updater` with Cloudflare Workers and R2 to deliver
signed, encrypted web bundles. Native code, plugins, permissions, and
`capacitor.config.ts` changes require a new App Store / Play Store release.
Users must already have an OTA-enabled native release.

### Publish an update

1. Test the changes against every native version in
   [`ota.json`](./ota.json), update its `compatibleNativeVersions` list as needed,
   and merge into `main`. Native and OTA versions are independent.
2. From a clean, up-to-date `main`, create and push an `ota-vX.Y.Z` tag. Choose an
   unused version higher than previous production OTA releases. Never reuse or
   move release tags.
3. Monitor [Publish OTA update](./.github/workflows/ota-production.yml) in GitHub
   Actions. It runs lint, typecheck, and tests, builds and signs the bundle,
   verifies its public download, then publishes the production manifest.
4. On a compatible device, let the update download, then background and reopen
   the app. Verify startup and the changed behavior.

The workflow uses `ota-build` for build settings and `production` for publishing.
The `VITE_*` environment variables used to build the OTA bundle come from GitHub
Actions variables and secrets configured for `ota-build`.
Production needs secrets `CAPGO_PRIVATE_KEY`, `R2_ACCESS_KEY_ID`, and
`R2_SECRET_ACCESS_KEY`, plus variables `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, and
`UPDATE_CDN`. The signing key must match the public key embedded in the native
app. See the workflow for build settings. Restrict R2 credentials to the OTA
bucket and `ota-v*` tag access to trusted release accounts.

### Recovery

The app must call `CapacitorUpdater.notifyAppReady()` after local initialization
and rendering, without waiting for network sync or wallet unlock. Missing the
30-second deadline triggers automatic rollback. Keep data migrations compatible
with fallback code; rollback does not undo stored data changes.

To pause new offers, set `enabled: false` in R2's `channels/production.json`.
Coordinate with running deployments, since publishing enables offers again.
This does not remove downloaded or installed updates. To fix a bad release,
publish corrected code under a higher OTA version; lowering the manifest version
does not downgrade installed updates.

## Nimiq Pay Flows

A flow is a sequence of steps that the user needs to follow to complete a user
story: Sign up, Log in, Send NIM, etc.

Since this is the core of the app, we rely on this flows to be well defined and
you can find them in the [flows](./src/lib/flows) folder with a
[README.md](./src/lib/flows/README.md) file that explains how flows works.

## Known issues

### Database encryption on Web

We are not encrypting the database on Web. This is because the library that we use to create a SQL database on the browser does not support
encryption. We are using `sql.js` under the hood, and it does not support encryption. **Android and iOS do support encryption**.

### Camera feed

The camera feed in mobile is weird. The Camera API for both Android and iOS, creates a camera feed that is set behind the WebView.
This creates an interesting challenge, since we need to make a "hole" in the WebView to show the camera feed. You can read more about this
in the [useCameraFeed](./src/composables/useCameraFeed.ts) composable. In web,
we just create a video element where we show the camera feed. Ez.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report security issues privately as
described in [SECURITY.md](./SECURITY.md).

## License

Nimiq Pay is licensed under the [GNU General Public License v3.0 only](./LICENSE) (`GPL-3.0-only`).
