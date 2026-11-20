# OTA release

Web-bundle update for native versions already installed from stores. Pushing `ota-vX.Y.Z` tag runs `.github/workflows/ota-production.yml`: lint, typecheck, tests, build, sign + encrypt bundle, upload to R2, publish `channels/production.json` with `compatibleNativeVersions` from `ota.json`. Devices on listed native version download in background, switch on next start.

Start here only after shared preflight (SKILL.md step 1) passed: local `main` equals `origin/main`, submodules current, checks green.

## O1. Native compatibility

Bundle built from `origin/main`, runs on every native version in `ota.json`. Each listed version must still run that web code.

```bash
jq -c .compatibleNativeVersions ota.json
for V in $(jq -r '.compatibleNativeVersions[]' ota.json); do
  git rev-parse -q --verify "refs/tags/$V" >/dev/null || echo "no tag $V"
  git merge-base --is-ancestor "$V" origin/main || echo "$V not on main"
  git diff --stat "$V" origin/main -- android ios capacitor.config.ts patches
  git diff "$V" origin/main -- package.json | grep -E '^[+-] ' | grep -iE 'capacitor|capgo|@ionic|plugin'
done
```

- Tag missing: stop and ask; list names version never released.
- `$PREV` (newest native tag) listed but not on `main`: its release PR not merged with merge commit. Stop; OTA would ship without that release's changes. Older listed tags can be off `main` because earlier release PRs were squash-merged (`2.22.0` via #33); for those only diff matters, and `git diff` works without ancestry.
- `$PREV` (newest native tag) not in list: users on newest store build won't get update. Almost always wrong; ask, propose adding it.
- Native diff since `V`: ignore lines that only bump versions or build numbers (`versionCode`, `versionName`, `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`, `CFBundle*Version`, `"version"`). Anything else (plugin bump, new permission, `capacitor.config.ts`, native code) means `V` would run web code built for newer native behaviour. Read change: if web code depends on it, drop `V`. Ask before narrowing list.
- Plugins bumped since `V`: web bundle now runs against plugin version `V` ships. For each, take that version from `git show "$V":pnpm-lock.yaml`, unpack in scratch folder (`npm pack <plugin>@<version>`, then `tar xzf`), check every option and method web code now passes exists there, in native `ios/` and `android/` sources too, not only typings. Option old native code ignores turns feature off on `V` without error (inappbrowser 8.21.1 ignored `javascriptBridgeOrigins`). List each under Found with what users on `V` lose, ask whether to drop `V`.
- Newest native version approved and live in both stores? Listing version still in review harmless; listing none users have pointless. Ask if unsure.

## O2. What ships

```bash
LAST_OTA=$(git tag -l 'ota-v*' --sort=-v:refname | head -1)
git log --oneline --no-merges "$LAST_OTA"..origin/main
```

Range from `$LAST_OTA` or newest listed native tag, whichever newer on `main`. Empty: nothing to ship, stop. Otherwise put list in report.

## O3. Rollback safety

Capgo rolls back to previous bundle when `CapacitorUpdater.notifyAppReady()` not called within 30 s (`appReadyTimeout`). Rollback doesn't undo stored data.

```bash
git diff "$LAST_OTA" origin/main -- src/lib/sql-queries.ts | grep -nE '^\+.*(toVersion|ALTER|CREATE|DROP)'
git log --oneline "$LAST_OTA"..origin/main -S notifyAppReady
```

- New migrations: check additive (new tables/columns/indexes) so previous bundle still works against migrated DB after rollback. Destructive or renaming migrations: stop and ask.
- Commits touching `notifyAppReady`: read them. Must still run after local init and render, without waiting for network sync or unlock.

## O4. `ota.json` change, if needed

`main` protected, so change goes through PR before tagging:

```bash
git switch -c chore/ota-native-<versions> origin/main
# edit ota.json
git add -- ota.json && git commit -S -m "chore(ota): <allow|target> native <versions>" -m "<reason>"
git push -u origin HEAD
gh pr create --base main --title "chore(ota): <allow|target> native <versions>" --body-file <file>
```

Then stop: user merges. After merge, rerun this mode, recheck `ota.json` on `origin/main`: squash merge once replaced entry instead of adding one (PR #60).

## O5. Version

Default: next patch above highest of `$LAST_OTA` and native versions in `ota.json` (native 2.22.0 → ota-v2.22.1; native 2.23.0 after ota-v2.22.1 → ota-v2.23.1). Check `ota-vX.Y.Z` unused locally and on origin (`git ls-remote --tags origin "ota-vX.Y.Z"`), and `X.Y.Z` no native tag. Ask user once with proposal first, unless they passed version. Never reuse or move OTA tags: failed version burned, fix ships under higher one.

## O6. Tag and push

```bash
git tag -s "ota-vX.Y.Z" -m "OTA X.Y.Z" origin/main
git tag -v "ota-vX.Y.Z"
git push origin "ota-vX.Y.Z"
```

In Claude Code push prompts for approval (`ask` rule in `.claude/settings.json`). Approve it: invoking OTA mode already asked for this tag.

Workflow rejects tags whose commit not on `main` and tags not matching `ota-vX.Y.Z`.

## O7. Watch the workflow

```bash
gh run list --workflow ota-production.yml --limit 1 --json databaseId,status,url,headBranch
gh run watch <id> --exit-status
```

Run `gh run watch` as background command, wait for exit (T3 Code: `t3_background_wait`). Publish job uses `production` environment, which can wait for manual approval in GitHub: if sits in `waiting`, tell user with run URL and stop.

On failure, hand run log (`gh run view <id> --log-failed`) to `log-reader` agent (Claude Code) or read failed step (Codex). Don't delete or move tag. "Bundle version already exists with different content" means earlier run uploaded this version: fix ships as new, higher tag.

## O8. Report

- **Blocked on me**: approval if pending; then manual device check: on phone with listed native version, let update download, background and reopen app, check it starts (no rollback) and changed behaviour present. To pause offers: set `enabled: false` in R2 `channels/production.json`; publishing new tag enables them again.
- **Changed**: tag, commit, workflow run URL and result, `ota.json` PR if any.
- **Found**: native versions covered, commits shipped, migration and `notifyAppReady` findings.