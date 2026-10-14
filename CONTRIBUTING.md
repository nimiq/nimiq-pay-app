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

## Making changes

- Keep a pull request to one change. Unrelated fixes go in separate pull requests.
- Add or update tests for new features and bug fixes.
- Don't edit `src/i18n/*.po` by hand. Run `pnpm i18n:extract` after changing user-facing strings. Translations are managed separately.
- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) format, for example `fix(send): reject amounts above balance`.

Run these before you push:

```sh
pnpm lint
pnpm typecheck
pnpm test:unit run
```

CI runs the same checks on every pull request.

## License

Nimiq Pay is licensed under [GPL-3.0-only](./LICENSE). Your contributions are covered by the same license, plus the rights granted in the CLA.
