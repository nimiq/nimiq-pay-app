---
name: release
description: Nimiq Pay releases. Native mode (App Store / Google Play) - preflight (main pulled, submodules current, checks green), `release-X.Y.Z` branch off main, `pnpm i18n:sync` + `chore: languages` commit, `ota.json` decision from the native diff, reviewed in-app changelog, the `pnpm release:beta` run (release-it: beta builds, signed tag, GitHub release, BrowserStack), release PR to main, App Store / Play store notes; stops before the manual `pnpm release`, signing and store upload. OTA mode (`ota`) - checks native compatibility, migrations and `ota.json`, then pushes a signed `ota-vX.Y.Z` tag from main and watches the publish workflow. Use whenever the user says "/release", "release 2.x.y", "do the release", "prepare the release", "run release:beta", "new native version", "cut a release", "release an OTA", "push an OTA update", "ota tag", or asks for the release PR or store changelog for a new version, even without naming the skill. Works the same from Claude Code and Codex.
---
# Nimiq Pay releases

Two modes:

- **Native** (default): whole beta-release routine, then the repo left ready for the user's manual final steps: `pnpm release`, signed store build, store upload. Steps 1-12 below.
- **OTA** (`ota` argument): web-bundle update for already installed native versions. Shared preflight (step 1), then `references/ota.md`.

Run the whole job, stop at the end with the report. Only earlier stops: a failed preflight check, a submodule or `main` question (step 1), the version question, `main` moving under the release branch (step 8), or a release-it failure after the tag was pushed.

Invoking native mode = user's explicit request to: create branch `release-X.Y.Z`, commit (languages, `ota.json`, release), push branch and tag, run release-it (TestFlight / Play beta build-number bumps, public GitHub release, BrowserStack upload), open the release PR. Invoking OTA mode = request to open an `ota.json` PR if needed and push the `ota-vX.Y.Z` tag. Neither authorizes: merging PRs, `pnpm release`, store uploads, force-push, moving or reusing tags, or changes to other repos.

Every commit and tag signed. No AI attribution in commits or the PR body. Prose others read (PR body, store notes, changelog entry) goes through the `humanizer` skill.

## Arguments

- `X.Y.Z` (optional): native version to release. Without it, step 2 proposes one and asks.
- `ota [X.Y.Z]`: OTA mode, optional OTA version. Read `references/ota.md` after step 1.

## 1. Preflight (both modes)

Stop and report under **Blocked on me** if any check fails. Don't work around it.

### Repo and tools

```bash
git status --porcelain                        # must be empty
git fetch origin --tags --prune
PREV=$(git tag --list '[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)   # last native release
git merge-base --is-ancestor "$PREV" origin/main && echo ok
gh pr list --state open --search 'head:release-' --json number,title,headRefName
node --version                                # must satisfy package.json engines
gh auth status
git config --get commit.gpgsign; git config --get user.signingkey
grep -oE '^(GITHUB_TOKEN|BROWSERSTACK_USERNAME|BROWSERSTACK_ACCESS_KEY|APP_IDENTIFIER|GOOGLE_PLAY_JSON_KEY_FILE)=' .env   # native mode
```

- `$PREV` not an ancestor of `origin/main`: the previous release PR isn't merged, or was squashed. `scripts/generate-changelog.mjs` diffs from the last reachable `🚀 Release v` commit, so the new changelog would repeat or miss changes. Name the open release PR and stop; it must be merged with a merge commit first.
- Open release PR exists (native mode): stop, name it.
- `.env` check prints names only. Never print secret values.

### `main` pulled

Releases are cut from `origin/main`, and the local `main` must match it so nothing local is missing or extra.

```bash
git switch main && git pull --ff-only origin main
git rev-parse main origin/main                # must be the same commit
git log --oneline origin/main..main           # must be empty (local-only commits)
```

- `pull --ff-only` fails or local `main` has commits `origin/main` lacks: stop and ask. Those commits must go through a PR (main is protected), or the user drops them. Never reset `main` yourself.
- Note `MAIN_AT=$(git rev-parse origin/main)`; step 8 and the report compare against it.

### Submodules

`vendor/trust-web3-provider` (branch `nimiq` of `nimiq/trust-web3-provider`) is built into the web bundle, so a stale checkout ships stale Mini Apps provider code.

```bash
git submodule status                          # leading '+' = checkout differs from pin, '-' = not initialized
git -C vendor/trust-web3-provider fetch -q origin nimiq
git -C vendor/trust-web3-provider log --oneline HEAD..FETCH_HEAD   # upstream commits newer than the pin
```

- `+` or `-`: ask the user before fixing. Offer `git submodule update --init --recursive && pnpm build:web3-provider`. Run it only after they agree, then recheck.
- Upstream has commits newer than the pin: list them and ask whether to release with the current pin or bump it first. Bumping the pin is its own PR to `main` (like `chore(deps): update trust-web3-provider to <sha>`), merged before the release; it isn't part of this run. If they choose to bump, stop here.

### Checks on `main`

`pnpm install --frozen-lockfile`, then lint, typecheck and tests. In Claude Code delegate to the `test-runner` agent; in Codex run `pnpm lint`, `pnpm typecheck`, `pnpm test` directly and check the exit code, not only pass counts. Failures on main block the release; report them, don't fix them in a release branch.

**OTA mode: continue in `references/ota.md`.**

## 2. Version

If no `X.Y.Z` argument: list `git log --no-merges --format=%s "$PREV"..origin/main`. Any `feat` or `!` breaking change → bump minor, else patch. Ask the user once, with the proposed version first and the commit counts per type as the reason. The tag is public and can't be reused, so this is the one question worth asking.

Either way, check the version is unused (`git rev-parse -q --verify "refs/tags/X.Y.Z"` prints nothing), higher than `$PREV`, and higher than every `ota-v*` tag (`git tag -l 'ota-v*' --sort=-v:refname | head -1`). Past native releases always went above the last OTA (ota-v2.20.1 → 2.21.0, ota-v2.22.1 → 2.23.0); a native build below an already published OTA version may be offered that OTA as an "update" (unconfirmed, updater server not in this repo). Ask if it isn't.

## 3. Branch

```bash
git switch -c release-X.Y.Z "$MAIN_AT"
git log --oneline HEAD..origin/main           # must be empty: branch has everything on main
```

## 4. Languages

```bash
pnpm i18n:sync          # extract en.po, push source to Weblate, pull de/es/fr/pt
git status --porcelain
```

Only `src/i18n/*.po` may change. Anything else: stop and report. If there are changes, commit them alone: `git add -- 'src/i18n/*.po' && git commit -S -m "chore: languages"`. release-it refuses a dirty tree, which is why languages go in their own commit before it runs. `*.po` files are generated: never hand-edit them.

## 5. `ota.json`

`ota.json` lists the native versions that future OTA bundles from `main` may install on. Decide from the native diff between `$PREV` and the branch:

```bash
git diff --stat "$PREV" HEAD -- android ios capacitor.config.ts patches
git diff "$PREV" HEAD -- package.json | grep -E '^[+-] ' | grep -iE 'capacitor|capgo|@ionic|plugin'
```

- Native code, plugin version, permission or `capacitor.config.ts` change that the web code relies on → `compatibleNativeVersions: ["X.Y.Z"]` only. An old binary would run the new web code with the old native behaviour.
- Nothing native, or only build metadata the web code can't observe (Info.plist purpose strings, version numbers, store assets) → append `"X.Y.Z"` and keep the existing entries.
- When a plugin was bumped, read its commit to check whether the web code passes new options or relies on new behaviour; say what you found in the commit body.

Commit only if the file changed: `chore(ota): target native X.Y.Z` (or `chore(ota): allow native X.Y.Z` when appending), with a one-line body giving the reason. `ota.json` is read only by `.github/workflows/ota-production.yml`; it doesn't affect the native build.

## 6. Push the branch

```bash
git push -u origin release-X.Y.Z
```

release-it has `requireUpstream: true` and fails with "No upstream configured" without this.

## 7. Changelog, reviewed before release-it

`pnpm release:beta` normally pauses so a human can review the AI changelog, but only in a TTY. Agent shells have none, so generate and review it first. release-it's `after:bump` hook reuses an existing entry for the version.

```bash
CHANGELOG_AI=<claude|codex> node scripts/generate-changelog.mjs X.Y.Z
```

Use `claude` from Claude Code and `codex` from Codex. Then review the `X.Y.Z` entry in `src/data/changelog.json` against `git log "$PREV"..HEAD`:

- every user-visible change covered, nothing that isn't in the range
- written for app users: no issue IDs, PR numbers, file names or internal terms
- "Mini Apps" spelled that way

Edit the JSON, run it through `humanizer`, then rerun the same command to regenerate `CHANGELOG.md` from the edited entry. Leave both files uncommitted; release-it stages tracked changes into the release commit. `git status --porcelain` must now show exactly `CHANGELOG.md` and `src/data/changelog.json`.

## 8. Run the beta release

First make sure `main` didn't move since the branch was cut. The release must contain everything on `main`:

```bash
git fetch origin main
git log --oneline HEAD..origin/main           # must be empty
```

Not empty: stop and ask. Options: merge `origin/main` into the branch (signed merge commit), then regenerate the changelog with `--force` and redo step 7's review; or release without those commits and say so in the PR. Never rebase or force-push the release branch.

This is `pnpm release:beta` without its interactive parts. `scripts/release-beta.mjs` asks for the AI CLI on stdin and doesn't forward flags, and release-it can't prompt without a TTY, so call release-it the same way the script does:

```bash
CHANGELOG_AI=<claude|codex> pnpm exec dotenv -- release-it X.Y.Z --ci \
  --git.tagArgs=-s --no-git.requireCleanWorkingDir 2>&1 | tee /tmp/release-X.Y.Z.log
```

- `--git.tagArgs=-s` signs the tag. `.release-it.json` doesn't, and tags `2.22.0` / `2.23.0` went out unsigned.
- `--no-git.requireCleanWorkingDir` only lets the two reviewed changelog files through; step 7 checked nothing else is dirty.
- Use `pnpm exec dotenv`, never bare `dotenv`: on this Mac that can resolve to an rbenv Ruby shim.
- `--dry-run` isn't read-only: it still runs `npm version` and bumps `package.json`. `git restore package.json` after one.
- `i18n:sync` already ran in step 4; don't run `pnpm release:beta` itself, it would sync again and might dirty the tree.

What it does (`.release-it.json`): bumps versions, runs `pnpm build:ios` and `pnpm build:android` (fastlane `beta` lanes; take build numbers from TestFlight and Play), commits `🚀 Release vX.Y.Z`, tags, pushes, creates a draft GitHub release with `.ipa`, `.app.tgz`, `.aab`, `.apk`, uploads to BrowserStack, publishes the release, deletes local builds.

It takes 20-40 minutes. Run it in the background and wait for it to exit (Claude Code: `run_in_background`, then wait for the completion notification; in T3 Code use `t3_background_wait`). Don't poll with sleep loops. Check the exit status and the tail of the log; in Claude Code hand the log to the `log-reader` agent when it failed.

**On failure**, find where it stopped before doing anything:

- Before `🚀 Release v` commit (preflight, changelog, build): fix the cause, `git restore` version files the bump touched if any, rerun the same command.
- After the tag was pushed (GitHub release, asset upload, BrowserStack): **don't rerun release-it**, it would release again. Finish the remaining steps by hand only if the user agrees: `gh release upload X.Y.Z <assets>`, `node scripts/browserstack-upload.js`, `gh release edit X.Y.Z --draft=false`. Report what's done and what's left under **Blocked on me**.

## 9. Verify

```bash
git log -1 --format='%h %G? %s'          # G, 🚀 Release vX.Y.Z
git tag -v X.Y.Z                          # good signature
git status --porcelain                    # empty
git rev-parse HEAD origin/release-X.Y.Z   # same commit
gh release view X.Y.Z --json isDraft,assets --jq '{isDraft, assets: [.assets[].name]}'
gh api repos/nimiq/nimiq-pay-app/commits/$(git rev-parse HEAD) --jq .commit.verification.verified
git fetch origin main && git log --oneline HEAD..origin/main   # empty, or list it under Found
```

Release not a draft, four assets, GitHub shows the commit verified. Commits that landed on `main` during the run aren't in this release: list them in the report so the user knows they need the next release or an OTA.

## 10. Release PR

```bash
gh pr create --base main --head release-X.Y.Z --title "chore(release): vX.Y.Z" --body-file <file>
```

Set the title explicitly: a past release PR merged under the wrong version. Body, short, through `humanizer`:

```markdown
Release X.Y.Z: <one sentence on the main user-facing changes>.

- Languages synced from Weblate (de, es, fr, pt)   <omit if no languages commit>
- `ota.json` <now targets only native X.Y.Z / also allows native X.Y.Z>: <reason>
- In-app changelog and CHANGELOG.md for X.Y.Z

Merge with a merge commit, not squash or rebase, so the `X.Y.Z` tag and the `🚀 Release vX.Y.Z` commit stay in main's history. The next release's changelog starts from that commit.
```

In T3 Code, link the PR (`link_pull_request`). Don't merge it.

## 11. Store notes

From the reviewed changelog entry write:

- **App Store "What's New"**
- **Google Play release notes**, 500 characters max (count them)

Brief, plain sentences, no emojis, no issue IDs. Run through `humanizer`. They go in the final report so the user can paste them at upload time.

## 12. Report

End with three headings:

- **Blocked on me**: anything that stopped the run, plus the manual steps, in order:
  1. Review and merge PR `#N` with a **merge commit**.
  2. From `release-X.Y.Z` at tag `X.Y.Z`, run `pnpm release` (syncs languages again, then `ionic cap build --prod`). If the sync changes `*.po` files, commit them to the branch before building.
  3. Build, sign and upload the store binaries. The beta `.aab` from release-it is a Debug build (fastlane `beta` lane), not the Play artifact.
  4. After upload, store notes below.
  5. Later OTA updates for this version: once the stores have approved X.Y.Z and the PR is merged, run this skill with `ota`.
- **Changed**: branch, commits (hash + subject), tag, GitHub release URL, PR URL, `ota.json` decision.
- **Found**: native diff summary, changelog edits you made, anything odd in the log. Then the App Store and Google Play notes.
