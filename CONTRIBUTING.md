# Contributing to Nimiq Pay

Thanks for helping with Nimiq Pay. This page covers what we need from you before a pull request can be merged.

## Security issues

Do not open a public issue or pull request for a vulnerability. Follow [SECURITY.md](./SECURITY.md) instead.

## Contributor License Agreement

Before we can merge your first pull request, you need to sign our [Contributor License Agreement](./CLA.md) (CLA). You keep the copyright in your work. The CLA lets Nimiq Labs Ltd. ship your contribution in the app stores, whose terms conflict with the GPL, and the open source version stays available under GPL-3.0.

When you open a pull request, a bot comments with a link to the CLA. To sign, post this exact comment on the pull request:

```text
I have read the CLA Document and I hereby sign the CLA
```

You only sign once, unless the CLA text changes. Every author of a commit in the pull request must sign, so make sure your commits use an email address linked to your GitHub account. If the check doesn't update after you sign, comment `recheck`.

## Before you start

For anything bigger than a small fix, open an issue first so we can agree on the approach. It saves you from writing code we can't merge.

## Development setup

See the [README](./README.md#development-setup). You need Node from `.nvmrc`, pnpm from `packageManager`, and the `vendor/trust-web3-provider` submodule. Copy `.env.example` to `.env` if you work on a feature that needs one of its values.

## Branches and pull requests

- Fork the repository and branch from `main`. Open your pull request against `main`.
- Sign your commits ([GitHub docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)). `main` rejects unsigned commits.
- We usually squash-merge, so the pull request title becomes the commit message. Write it in the Conventional Commits format described below.
- To merge, a pull request needs one approving review, all review threads resolved, a branch that is up to date with `main`, and passing `lint`, `test`, `build-web` and `cla` checks. New pushes dismiss earlier approvals.

## Making changes

- Keep a pull request to one change. Unrelated fixes go in separate pull requests.
- Add or update tests for new features and bug fixes.
- Don't edit generated files by hand:
  - `src/i18n/*.po`: run `pnpm i18n:extract` after changing user-facing strings. Translations are managed separately.
  - `public/web3-provider.js`: built from `web3-provider/` by `pnpm build:web3-provider`, not committed.
  - `public/nimiq/`: copied from `@nimiq/core` on install, not committed.
- Database schema changes must be additive. Add a new migration in `src/lib/sql-queries.ts`; never edit an existing `CREATE TABLE`.
- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) format, for example `fix(send): reject amounts above balance`.

Run these before you push:

```sh
pnpm lint
pnpm typecheck
pnpm test:unit run
```

CI runs the same checks on every pull request.

## Terminology

Use these terms in code, UI strings and docs:

- **Mini Apps**: capitalized, two words. Not "mini apps", "mini-apps" or "dapps".
- **NIM** for the coin, **Nimiq** for the network and the project.
- **USDT** for Tether on Polygon.
- **Remote signer**: an HTLC shared with the Nimiq Pay cosigner. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#nimiq-sync-and-the-cosigner).

## License

Nimiq Pay is licensed under [GPL-3.0-only](./LICENSE). Your contributions are covered by the same license, plus the rights granted in the CLA.
