# Review brief

Both agents have repo `reviewer` agent (`.claude/agents/reviewer.md` with hunter/verifier panel, `.codex/agents/reviewer.toml` single-pass). Call it with brief below as INTENT so every finding carries production reachability, who's affected, worst case. Pass verbatim, plus: issue ID and summary, worktree path, diff command (`git -C <worktree> diff origin/main...HEAD` plus uncommitted changes), round number, and on re-reviews prior findings and last-reviewed commit.

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