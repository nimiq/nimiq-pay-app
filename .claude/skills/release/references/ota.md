# OTA release

Web-bundle update for native versions already installed from the stores. Pushing an `ota-vX.Y.Z` tag runs `.github/workflows/ota-production.yml`: lint, typecheck, tests, build, sign and encrypt the bundle, upload to R2, publish `channels/production.json` with the `compatibleNativeVersions` from `ota.json`. Devices on a listed native version download it in the background and switch on the next start.

Start here only after the shared preflight (SKILL.md step 1) passed: local `main` equals `origin/main`, submodules current, checks green.

## O1. Native compatibility

The bundle is built from `origin/main` and runs on every native version in `ota.json`. Each listed version must still be able to run that web code.

```bash
jq -c .compatibleNativeVersions ota.json
for V in $(jq -r '.compatibleNativeVersions[]' ota.json); do
  git rev-parse -q --verify "refs/tags/$V" >/dev/null || echo "no tag $V"
  git merge-base --is-ancestor "$V" origin/main || echo "$V not on main"
  git diff --stat "$V" origin/main -- android ios capacitor.config.ts patches
  git diff "$V" origin/main -- package.json | grep -E '^[+-] ' | grep -iE 'capacitor|capgo|@ionic|plugin'
done
```

- Tag missing: stop and ask; the list names a version that was never released.
- `$PREV` (newest native tag) listed but not on `main`: its release PR isn't merged with a merge commit. Stop; the OTA would ship without that release's changes. Older listed tags can be off `main` because earlier release PRs were squash-merged (`2.22.0` via #33); for those only the diff matters, and `git diff` works without ancestry.
- `$PREV` (newest native tag) not in the list: users on the newest store build won't get the update. Almost always wrong; ask, proposing to add it.
- Native diff since `V`: ignore lines that only bump versions or build numbers (`versionCode`, `versionName`, `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`, `CFBundle*Version`, `"version"`). Anything else (plugin bump, new permission, `capacitor.config.ts`, native code) means `V` would run web code built for newer native behaviour. Read the change: if the web code depends on it, `V` must be dropped. Ask before narrowing the list.
- Was the newest native version approved and live in both stores? Listing a version that's still in review is harmless; listing none that users have is pointless. Ask if unsure.

## O2. What ships

```bash
LAST_OTA=$(git tag -l 'ota-v*' --sort=-v:refname | head -1)
git log --oneline --no-merges "$LAST_OTA"..origin/main
```

Range from `$LAST_OTA` or the newest listed native tag, whichever is newer on `main`. Empty: nothing to ship, stop. Otherwise this list goes in the report.

## O3. Rollback safety

Capgo rolls back to the previous bundle when `CapacitorUpdater.notifyAppReady()` isn't called within 30 s (`appReadyTimeout`). Rollback doesn't undo stored data.

```bash
git diff "$LAST_OTA" origin/main -- src/lib/sql-queries.ts | grep -nE '^\+.*(toVersion|ALTER|CREATE|DROP)'
git log --oneline "$LAST_OTA"..origin/main -S notifyAppReady
```

- New migrations: check they're additive (new tables/columns/indexes) so the previous bundle still works against the migrated DB after a rollback. Destructive or renaming migrations: stop and ask.
- Commits touching `notifyAppReady`: read them. It must still run after local init and render, without waiting for network sync or unlock.

## O4. `ota.json` change, if needed

`main` is protected, so a change goes through a PR before tagging:

```bash
git switch -c chore/ota-native-<versions> origin/main
# edit ota.json
git add -- ota.json && git commit -S -m "chore(ota): <allow|target> native <versions>" -m "<reason>"
git push -u origin HEAD
gh pr create --base main --title "chore(ota): <allow|target> native <versions>" --body-file <file>
```

Then stop: the user merges. After the merge, rerun this mode and recheck `ota.json` on `origin/main`: a squash merge once replaced an entry instead of adding one (PR #60).

## O5. Version

Default: next patch above the highest of `$LAST_OTA` and the native versions in `ota.json` (native 2.22.0 → ota-v2.22.1; native 2.23.0 after ota-v2.22.1 → ota-v2.23.1). Check `ota-vX.Y.Z` is unused locally and on origin (`git ls-remote --tags origin "ota-vX.Y.Z"`), and that `X.Y.Z` is no native tag. Ask the user once with the proposal first, unless they passed a version. OTA tags are never reused or moved: a failed version is burned, the fix ships under a higher one.

## O6. Tag and push

```bash
git tag -s "ota-vX.Y.Z" -m "OTA X.Y.Z" origin/main
git tag -v "ota-vX.Y.Z"
git push origin "ota-vX.Y.Z"
```

The workflow rejects tags whose commit isn't on `main` and tags not matching `ota-vX.Y.Z`.

## O7. Watch the workflow

```bash
gh run list --workflow ota-production.yml --limit 1 --json databaseId,status,url,headBranch
gh run watch <id> --exit-status
```

Run `gh run watch` as a background command and wait for it to exit (T3 Code: `t3_background_wait`). The publish job uses the `production` environment, which can wait for manual approval in GitHub: if it sits in `waiting`, tell the user with the run URL and stop.

On failure, hand the run log (`gh run view <id> --log-failed`) to the `log-reader` agent (Claude Code) or read the failed step (Codex). Don't delete or move the tag. "Bundle version already exists with different content" means an earlier run uploaded this version: the fix ships as a new, higher tag.

## O8. Report

- **Blocked on me**: approval if pending; then the manual device check: on a phone with a listed native version, let the update download, background and reopen the app, check it starts (no rollback) and the changed behaviour is there. To pause offers: set `enabled: false` in R2 `channels/production.json`; publishing a new tag enables them again.
- **Changed**: tag, commit, workflow run URL and result, `ota.json` PR if any.
- **Found**: native versions covered, commits shipped, migration and `notifyAppReady` findings.
