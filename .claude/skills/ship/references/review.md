# Review brief

Both agents have repo `reviewer` agent (`.claude/agents/reviewer.md` with hunter/verifier panel, `.codex/agents/reviewer.toml` single-pass). Call it with brief below as INTENT so every finding carries production reachability, who's affected, worst case. Pass verbatim, plus: issue ID and summary, worktree path, diff command (`git -C <worktree> diff --merge-base origin/main` plus untracked files from `git -C <worktree> ls-files --others --exclude-standard`), round number, and on re-reviews prior findings and last-reviewed commit.

---

You review fix for Linear issue <ID> in nimiq/nimiq-pay-app (Vue 3 + Ionic + Capacitor wallet, Nimiq + USDT/Polygon, HTLC cosigner, Mini Apps). Read-only: no edit, commit, push. Project gotchas in CLAUDE.md at repo root; read it.

Report only merge-blocking problems:
- bugs diff introduces or leaves unfixed in issue's root cause
- regressions for existing users (DB migrations, stored state from older versions, listeners registered twice, sync paths)
- changes not needed for this issue (scope)

Per finding give:
- `file:line`
- why wrong
- how to show failure (concrete input or state → wrong result)
- **reachable in production?** yes/no and path there
- **who's affected:** new install / upgraded / normal / power user (many txs or HTLCs) / users already broken / NIM / USDT / Android / iOS / Mini App devs
- **worst case:** funds stuck or lost, wrong balance shown, crash, cosmetic
- tag: `Important` (introduced or left by this diff) or `Pre-existing` (exists on main)

Also answer: diff fixes issue's root cause, not just symptom? yes/no and why.

No style, naming, nits. If nothing blocks, say so in one line.

---

## Handling the result

- Check each finding's evidence against code before acting. Reviewers sometimes confidently wrong.
- Fix `Important`. List `Pre-existing` in report. File one as Linear issue only if real and user-facing.
- Rejected findings: one-line reason in `state.md`, and in PR under Decisions if human reviewer likely raises same thing.

## Security brief

Pass verbatim to fresh subagent, plus issue ID, worktree path, diff command from above.

---

You do security review of change for Linear issue <ID> in nimiq/nimiq-pay-app (Capacitor wallet holding user keys, runs third-party Mini Apps in webview). Read-only: no edit, commit, push. Read `REVIEW.md` and code around diff.

Report only vulnerabilities this diff introduces or makes reachable, with concrete attack path, confidence 8/10 or higher:
- keys, recovery words, PIN reaching logs, PostHog, Mini Apps, clipboard or network
- signed recipient, amount or chain differing from what user confirmed
- Mini App getting signing, account data or host APIs without confirmation; origin checks bypassed; untrusted bridge input trusted
- deep link, QR or remote response triggering action without user intent
- OTA bundle or update signature check weakened
- GitHub workflow letting untrusted PR code reach secrets or write tokens

Not findings: DoS, rate limits, missing hardening without attack path, outdated dependencies, docs.

Per finding give `file:line`, attack path, who's affected, worst case; tag `Important` (this diff) or `Pre-existing` (on main). If nothing, say so in one line.