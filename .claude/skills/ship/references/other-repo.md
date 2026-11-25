# Work in another repo

Two cases, only when user asks:
- **Ship in another repo:** "use ship" for nimiq-website, walkie-talkie, a Nimiq plugin, similar.
- **Upstream fix:** Nimiq Pay issue needs change in a plugin, the provider (`nimiq/trust-web3-provider`), pay-cos, core-albatross or developer-center.

User's request authorizes branch, signed commits, push and PR in that repo. Not merging, releases, deploys, or comments on public threads user didn't name.

## Setup

- Work in durable checkout: existing clone under `~/nimiq/<repo>` (worktree off default branch), else ask before cloning there. Not `/tmp`: reboot wipes it, plus any `.env` and stubs. (`/tmp` clone fine for read-only inspection, not shipping.)
- Replace `nimiq/nimiq-pay-app` with this repo in every SKILL.md command (`gh pr list`, `gh pr create`, `--repo`).
- Keep state in `<pay-repo>/.claude/worktrees/.ship/<ISSUE>/` (driving `APP` issue, or `GH-<n>`).
- Read repo's `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` and PR template.
- Find lint, typecheck, test, build commands in `package.json` and CI workflows. Brief `test-runner` with them: defaults to Nimiq Pay's.
- Secrets: never read repo's `.env`. Worktree gets it as symlink from main clone (`ln -s`, as SKILL.md phase 2). Ask via secret-request tool (T3 `request_secret`) when deploy or build needs one.

## Gates

Same as SKILL.md phase 5; swap stack line in review and security briefs for this repo's.
- Phase 7 becomes web check when change has UI: Playwright at 1440 and 390 px, headed or real Chrome for scrollbars and overflow, WebKit for audio and gesture rules. New page: "Before" is production URL.
- Attach screenshots with `gh --attach` (`references/pr.md`), `--repo <owner/repo>`.
- PR body: "Upstream PR" shape in `references/pr.md` for repos we don't own, "Nimiq Pay PR" shape for Nimiq repos.

## Upstream fixes

- Before proposing one, confirm bug on latest upstream release; check upstream open issues and PRs (SKILL.md phase 3).
- Open upstream PRs as **draft** with minimal repro: branch, page or test showing FAIL before, PASS after. Test fix on device before opening.
- Keep Pay worktree. Its change waits uncommitted, or as draft PR, with "waiting on <upstream PR> + release" in `state.md`.
- Linear: comment upstream PR's full URL on `APP` issue, keep it In Progress with "blocked on <URL>" and resume steps.
- Put our status notes on Linear issue, never on public upstream thread. Comment upstream only on thread user names.
- Provider submodule: once approved plan includes provider change, approval covers branch and PR on `nimiq/trust-web3-provider` (base `nimiq`). Then Pay PR moves pin (`trust-web3-provider` skill).

## Report

Same three headings. Link every PR in every repo; comment each on driving Linear issue.