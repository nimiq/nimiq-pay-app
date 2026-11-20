---
name: release
description: 'Nimiq Pay releases. Native mode (App Store / Google Play) - preflight (main pulled, submodules current, checks green), `release-X.Y.Z` branch off main, `pnpm i18n:sync` + `chore: languages` commit, `ota.json` decision from the native diff, reviewed in-app changelog, the `pnpm release:beta` run (release-it: beta builds, signed tag, GitHub release, BrowserStack), release PR to main, App Store / Play store notes; stops before the manual `pnpm release`, signing and store upload. OTA mode (`ota`) - checks native compatibility, migrations and `ota.json`, then pushes a signed `ota-vX.Y.Z` tag from main and watches the publish workflow. Use whenever the user says "/release", "release 2.x.y", "do the release", "prepare the release", "run release:beta", "new native version", "cut a release", "release an OTA", "push an OTA update", "ota tag", or asks for the release PR or store changelog for a new version, even without naming the skill. Works the same from Claude Code and Codex.'
---
# Nimiq Pay releases

Two modes:

- **Native** (default): full beta-release routine, then repo left ready for user's manual final steps: `pnpm release`, signed store build, store upload. Steps 1-12 below.
- **OTA** (`ota` argument): web-bundle update for already-installed native versions. Shared preflight (step 1), then `references/ota.md`.

Run whole job, stop at end with report. Only earlier stops: failed preflight check, submodule or `main` question (step 1), version question, `main` moving under release branch (step 8), or release-it failure after tag pushed.

Invoking native mode = user's explicit request to: create branch `release-X.Y.Z`, commit (languages, `ota.json`, release), push branch and tag, run release-it (TestFlight / Play beta build-number bumps, public GitHub release, BrowserStack upload), open release PR. Invoking OTA mode = request to open `ota.json` PR if needed and push `ota-vX.Y.Z` tag. Neither authorizes: merging PRs, `pnpm release`, store uploads, force-push, moving or reusing tags, or changes to other repos.

Sign every commit and tag. No AI attribution in commits or PR body. Run prose others read (PR body, store notes, changelog entry) through `humanizer` skill.

## Arguments

- `X.Y.Z` (optional): native version to release. Without it, step 2 proposes one and asks.
- `ota [X.Y.Z]`: OTA mode, optional OTA version. Read `references/ota.md` after step 1.
- `sdk`: publishing `@nimiq/mini-app-sdk` to npm not this skill: use `trust-web3-provider` skill ("Publish @nimiq/mini-app-sdk").

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
```

- `$PREV` not ancestor of `origin/main`: previous release PR not merged, or squashed. `scripts/generate-changelog.mjs` diffs from last reachable `🚀 Release v` commit, so new changelog would repeat or miss changes. Name open release PR and stop; must be merged with merge commit first.
- Open release PR exists (native mode): stop, name it.
- Don't read `.env` (deny rule in `.claude/settings.json`). release-it's `before:init` hook checks required variables and names missing ones, before version bump. Never print secret values.

### `main` pulled

Releases cut from `origin/main`; local `main` must match it so nothing local missing or extra.

```bash
git switch main && git pull --ff-only origin main
git rev-parse main origin/main                # must be the same commit
git log --oneline origin/main..main           # must be empty (local-only commits)
```

- `pull --ff-only` fails or local `main` has commits `origin/main` lacks: stop and ask. Those commits must go through PR (main protected), or user drops them. Never reset `main` yourself.
- Note `MAIN_AT=$(git rev-parse origin/main)`; step 8 and report compare against it.

### Submodules

`vendor/trust-web3-provider` (branch `nimiq` of `nimiq/trust-web3-provider`) built into web bundle, so stale checkout ships stale Mini Apps provider code.

```bash
git submodule status                          # leading '+' = checkout differs from pin, '-' = not initialized
git -C vendor/trust-web3-provider fetch -q origin nimiq
git -C vendor/trust-web3-provider log --oneline HEAD..FETCH_HEAD   # upstream commits newer than the pin
```

- `+` or `-`: ask user before fixing. Offer `git submodule update --init --recursive && pnpm build:web3-provider`. Run only after they agree, then recheck.
- Upstream has commits newer than pin: list them, ask whether to release with current pin or bump first. Pin bump = own PR to `main` (like `chore(deps): update trust-web3-provider to <sha>`), merged before release; not part of this run. If they choose bump, stop here.

### Checks on `main`

`pnpm install --frozen-lockfile`, then lint, typecheck, tests. In Claude Code delegate to `test-runner` agent; in Codex run `pnpm lint`, `pnpm typecheck`, `pnpm test` directly and check exit code, not only pass counts. Failures on main block release; report them, don't fix in release branch.

**OTA mode: continue in `references/ota.md`.**

## 2. Version

If no `X.Y.Z` argument: list `git log --no-merges --format=%s "$PREV"..origin/main`. Any `feat` or `!` breaking change → bump minor, else patch. Ask user once, proposed version first, commit counts per type as reason. Tag public and can't be reused, so this is the one question worth asking.

Either way, check version unused (`git rev-parse -q --verify "refs/tags/X.Y.Z"` prints nothing), higher than `$PREV`, and higher than every `ota-v*` tag (`git tag -l 'ota-v*' --sort=-v:refname | head -1`). Past native releases always went above last OTA (ota-v2.20.1 → 2.21.0, ota-v2.22.1 → 2.23.0); native build below already-published OTA version may get that OTA offered as "update" (unconfirmed, updater server not in this repo). Ask if it isn't.

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

Only `src/i18n/*.po` may change. Anything else: stop and report. If changes, commit them alone: `git add -- 'src/i18n/*.po' && git commit -S -m "chore: languages"`. release-it refuses dirty tree, hence languages in own commit before it runs. `*.po` files generated: never hand-edit.

## 5. `ota.json`

`ota.json` lists native versions future OTA bundles from `main` may install on. Decide from native diff between `$PREV` and branch:

```bash
git diff --stat "$PREV" HEAD -- android ios capacitor.config.ts patches
git diff "$PREV" HEAD -- package.json | grep -E '^[+-] ' | grep -iE 'capacitor|capgo|@ionic|plugin'
```

- Native code, plugin version, permission or `capacitor.config.ts` change web code relies on → `compatibleNativeVersions: ["X.Y.Z"]` only. Old binary would run new web code with old native behaviour.
- Nothing native, or only build metadata web code can't observe (Info.plist purpose strings, version numbers, store assets) → append `"X.Y.Z"`, keep existing entries.
- When plugin bumped, read its commit to check whether web code passes new options or relies on new behaviour; state findings in commit body.

Commit only if file changed: `chore(ota): target native X.Y.Z` (or `chore(ota): allow native X.Y.Z` when appending), one-line body giving reason. `ota.json` read only by `.github/workflows/ota-production.yml`; doesn't affect native build.

## 6. Push the branch

```bash
git push -u origin release-X.Y.Z
```

release-it has `requireUpstream: true`, fails with "No upstream configured" without this.

## 7. Changelog, reviewed before release-it

`pnpm release:beta` normally pauses for human review of AI changelog, but only in TTY. Agent shells have none, so generate and review first. release-it's `after:bump` hook reuses existing entry for version.

```bash
CHANGELOG_AI=<claude|codex> node scripts/generate-changelog.mjs X.Y.Z
```

Use `claude` from Claude Code, `codex` from Codex. Then review `X.Y.Z` entry in `src/data/changelog.json` against `git log "$PREV"..HEAD`:

- every user-visible change covered, nothing outside range
- written for app users: no issue IDs, PR numbers, file names or internal terms
- "Mini Apps" spelled that way

Edit JSON, run through `humanizer`, then rerun same command to regenerate `CHANGELOG.md` from edited entry. Leave both files uncommitted; release-it stages tracked changes into release commit. `git status --porcelain` must now show exactly `CHANGELOG.md` and `src/data/changelog.json`.

## 8. Run the beta release

First confirm `main` didn't move since branch cut. Release must contain everything on `main`:

```bash
git fetch origin main
git log --oneline HEAD..origin/main           # must be empty
```

Not empty: stop and ask. Options: merge `origin/main` into branch (signed merge commit), then regenerate changelog with `--force` and redo step 7 review; or release without those commits and say so in PR. Never rebase or force-push release branch.

This = `pnpm release:beta` minus interactive parts. `scripts/release-beta.mjs` asks for AI CLI on stdin and doesn't forward flags, and release-it can't prompt without TTY, so call release-it same way script does:

```bash
CHANGELOG_AI=<claude|codex> pnpm exec dotenv -- release-it X.Y.Z --ci \
  --git.tagArgs=-s --no-git.requireCleanWorkingDir 2>&1 | tee /tmp/release-X.Y.Z.log
```

- `--git.tagArgs=-s` signs tag. `.release-it.json` doesn't; tags `2.22.0` / `2.23.0` went out unsigned.
- `--no-git.requireCleanWorkingDir` only lets two reviewed changelog files through; step 7 checked nothing else dirty.
- Use `pnpm exec dotenv`, never bare `dotenv`: on this Mac it can resolve to rbenv Ruby shim.
- `--dry-run` not read-only: still runs `npm version`, bumps `package.json`. Run `git restore package.json` after one.
- `i18n:sync` already ran in step 4; don't run `pnpm release:beta` itself, would sync again and might dirty tree.

What it does (`.release-it.json`): bumps versions, runs `pnpm build:ios` and `pnpm build:android` (fastlane `beta` lanes; build numbers from TestFlight and Play), commits `🚀 Release vX.Y.Z`, tags, pushes, creates draft GitHub release with `.ipa`, `.app.tgz`, `.aab`, `.apk`, uploads to BrowserStack, publishes release, deletes local builds.

Takes 20-40 minutes. Run in background, wait for exit (Claude Code: `run_in_background`, then wait for completion notification; in T3 Code use `t3_background_wait`). Don't poll with sleep loops. Check exit status and log tail; in Claude Code hand log to `log-reader` agent on failure.

**On failure**, find where it stopped before doing anything:

- Before `🚀 Release v` commit (preflight, changelog, build): fix cause, `git restore` version files bump touched if any, rerun same command.
- After tag pushed (GitHub release, asset upload, BrowserStack): **don't rerun release-it**, would release again. Finish remaining steps by hand only if user agrees: `gh release upload X.Y.Z <assets>`, `node scripts/browserstack-upload.js`, `gh release edit X.Y.Z --draft=false`. Report done and remaining under **Blocked on me**.

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

Release not draft, four assets, GitHub shows commit verified. Commits landing on `main` during run not in this release: list them in report so user knows they need next release or OTA.

## 10. Release PR

```bash
gh pr create --base main --head release-X.Y.Z --title "chore(release): vX.Y.Z" --body-file <file>
```

Set title explicitly: past release PR merged under wrong version. Body short, through `humanizer`:

```markdown
Release X.Y.Z: <one sentence on the main user-facing changes>.

- Languages synced from Weblate (de, es, fr, pt)   <omit if no languages commit>
- `ota.json` <now targets only native X.Y.Z / also allows native X.Y.Z>: <reason>
- In-app changelog and CHANGELOG.md for X.Y.Z

Merge with a merge commit, not squash or rebase, so the `X.Y.Z` tag and the `🚀 Release vX.Y.Z` commit stay in main's history. The next release's changelog starts from that commit.
```

In T3 Code, link PR (`link_pull_request`). Don't merge it.

## 11. Store notes

From reviewed changelog entry write:

- **App Store "What's New"**
- **Google Play release notes**, 500 characters max (count them)

One change per line: no headings, paragraphs, emojis, issue IDs. Put single-platform fix only in that store's notes. Run through `humanizer`. Put them in final report so user can paste at upload time.

## 12. Report

End with three headings:

- **Blocked on me**: anything that stopped run, plus manual steps, in order:
  1. Review and merge PR `#N` with **merge commit**.
  2. From `release-X.Y.Z` at tag `X.Y.Z`, run `pnpm release` (syncs languages again, then `ionic cap build --prod`). If sync changes `*.po` files, commit them to branch before building.
  3. Build, sign, upload store binaries. Beta `.aab` from release-it is Debug build (fastlane `beta` lane), not Play artifact.
  4. After upload, store notes below.
  5. Later OTA updates for this version: once stores approved X.Y.Z and PR merged, run this skill with `ota`.
- **Changed**: branch, commits (hash + subject), tag, GitHub release URL, PR URL, `ota.json` decision.
- **Found**: native diff summary, changelog edits made, anything odd in log. Then App Store and Google Play notes.