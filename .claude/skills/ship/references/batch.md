# Batches and sweeps

## Several issues (`ship <ISSUE>, <ISSUE>` or "do all triage issues")

For "do all triage issues", first list Appsolut team (key `APP`) Triage/Todo issues in Linear, use their IDs.

### Claude Code: the `ship-batch` workflow

`/ship` for several issues = user opt-in to run this workflow. Script exists: don't load `workflow-authoring`. Call twice:

1. **Plan:** `Workflow({ scriptPath: "<repo>/.claude/skills/ship/workflows/ship-batch.js", args: { mode: "plan", repo: "<repo>", branchPrefix: "<you>", issues: ["<ISSUE>", "<ISSUE>"] } })` (`<repo>` = absolute path of main checkout, `<you>` as in SKILL.md phase 2). Read-only, parallel. Each item returns `status`, root cause, options, `approach`, `branchSlug`, `deviceTestable`, `devicePlan`.
2. **Approve:** report `already_solved`, `has_open_pr`, `not_a_bug`, `blocked` items with evidence. Ask in **one** message (SKILL.md phase 3 format):
   - every `needs_approval` item
   - device inputs runs need: iPhone unlock + runner approval (flag items with iOS-specific risk), testnet vs mainnet wallet, second test wallet, phone's own PIN
   Put answers into each item's `devicePlan`.
3. **Run:** `Workflow({ scriptPath: …, args: { mode: "run", repo, branchPrefix, issues: [{ id, approach, branchSlug, deviceTestable, devicePlan, decisions }] } })`, `decisions` = rejected options for PR's Decisions section. Optional per issue:
   - `finalReviewDone: true`: skip final review (earlier run already did it on same change).
   - `holdShip: "<reason>"`: stop before commit (e.g. waiting on upstream release); worktree stays.

   Per issue: fix in own worktree → repo `reviewer` loop (max 3 rounds) → security review if round flagged it → one Fable final review → device (one at a time) → signed commit + PR with screenshots attached.
   **Never two `run` calls at once:** device lock lives inside one run. Ready items start right away in one run; items approved later wait for it to return, then go in second run.
4. If run dies, re-invoke with same `scriptPath`, same args, `resumeFromRunId`. Finished agents return from cache.
5. Read result: output file is `{"result": …}`, `result` can be JSON string. Parse with `d = json.load(f)["result"]; d = json.loads(d) if isinstance(d, str) else d`.
6. Follow up in main session:
   - File each item's `preExisting` findings per "Handling the result" in `references/review.md`.
   - `screenshots` = attached count. Attach only when 0 and PNGs exist; never re-upload.
   - `device.blockedOnUser`: PR opened as draft. Put under **Blocked on me**; once unblocked, finish with single `/ship <ID>` run (state.md has context) and mark PR ready. Check left to user: serve that item's After worktree on :8100 and run `verify-build.sh` right before handing over, one item at a time. Workflow leaves `main` on :8100.
   - Update `<repo>/.claude/worktrees/.ship/batch.md` after every follow-up step.

### Codex

Do plan step yourself or one subagent per issue, ask once, then spawn one subagent per approved issue running this skill (3 at a time). Run device phases yourself after, one issue at a time.

### Both

- Device phase **one issue at a time**: one phone, one :8100.
- Keep one `<repo>/.claude/worktrees/.ship/<ISSUE>/state.md` per issue, plus `<repo>/.claude/worktrees/.ship/batch.md` with one line per issue (status, PR). Resume from those.
- Run final review on strongest model: once per issue, never in loop.
- At end, give one combined report (Blocked on me / Changed / Found) with table issue → PR → status. Stop after listed issues; don't pull new ones.

## `sweep`: open PRs, most important first

Handle each open PR in nimiq/nimiq-pay-app, most important first (security > funds/HTLC > sync > UI). Skip PRs user excluded.

1. Still relevant? Linked issue still open, bug still happens on current `main`? If not, recommend closing, with evidence.
2. Rebase/resolve conflicts if needed, in worktree. Ask before force-pushing.
3. Run review brief from `references/review.md` on full PR diff. Also check: change in scope, can be simpler, description matches diff, easy for human to review?
4. Device-tested with Before/After table? If not and testable, do phase 7.
5. Fix `Important` findings, push, update description.
6. Report PR (one short block), go straight to next. Stop when list done.