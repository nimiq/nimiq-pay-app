# Batches and sweeps

## Several issues (`ship <ISSUE>, <ISSUE>` or "do all triage issues")

For "do all triage issues", first list Nimiq Pay team Triage/Todo issues in Linear, use their IDs.

### Claude Code: the `ship-batch` workflow

`/ship` for several issues = user opt-in to run this workflow. Call twice:

1. **Plan:** `Workflow({ scriptPath: "<repo>/.claude/skills/ship/workflows/ship-batch.js", args: { mode: "plan", repo: "<repo>", branchPrefix: "<you>", issues: ["<ISSUE>", "<ISSUE>"] } })` (`<repo>` = absolute path of the main checkout, `<you>` as in SKILL.md phase 2). Read-only, parallel. Each item returns `status`, root cause, options, `approach`, `branchSlug`, `deviceTestable`, `devicePlan`.
2. **Approve:** report `already_solved`, `has_open_pr`, `not_a_bug`, `blocked` items with evidence. Ask about every `needs_approval` item in **one** message (SKILL.md phase 3 format), plus any device question. If some items `ready`, start step 3 with those immediately; run approved ones as second `run` call once user answers.
3. **Run:** `Workflow({ scriptPath: …, args: { mode: "run", repo, branchPrefix, issues: [{ id, approach, branchSlug, deviceTestable, devicePlan, decisions }] } })`, `decisions` = rejected options for PR's Decisions section. Per issue: fix in own worktree → repo `reviewer` loop (max 3 rounds) → one Fable final review → device (one at a time) → signed commit and PR → screenshot upload (one at a time).
4. If run dies, re-invoke with same `scriptPath`, same args, `resumeFromRunId`. Finished agents return from cache.
5. Send device `blockedOnUser` items and screenshot failures to user under **Blocked on me**. Once unblocked, finish those with single `/ship <ID>` runs (state.md has context).

### Codex

Do plan step yourself or one subagent per issue, ask once, then spawn one subagent per approved issue running this skill (3 at a time). Run device and screenshot phases yourself after, one issue at a time.

### Both

- Device phase **one issue at a time**: one phone, one :8100. Same for screenshot uploads (one browser).
- One `/tmp/ship/<ISSUE>/state.md` per issue, plus `/tmp/ship/batch.md` with one line per issue (status, PR). Resume from those.
- Final review on strongest model: once per issue, never in loop.
- At end, one combined report (Blocked on me / Changed / Found) with table issue → PR → status. Stop after listed issues; don't pull new ones.

## `sweep`: open PRs, most important first

Each open PR in nimiq/nimiq-pay-app, most important first (security > funds/HTLC > sync > UI). Skip PRs user excluded.

1. Still relevant? Linked issue still open, bug still happens on current `main`? If not, recommend closing, with evidence.
2. Rebase/resolve conflicts if needed, in worktree. Ask before force-pushing.
3. Run review brief from `references/review.md` on full PR diff. Also check: change in scope, can be simpler, description matches diff, easy for human to review?
4. Device-tested with Before/After table? If not and testable, do phase 7.
5. Fix `Important` findings, push, update description.
6. Report PR (one short block), go straight to next. Stop when list done.