# `land`: from open PR to merged and cleaned up

`/ship land <PR>` takes one PR. `/ship land` no number → every open PR of user's in nimiq/nimiq-pay-app, most important first, one after another. Invoking authorizes commits + normal pushes to PR branch. Does **not** authorize force-pushes, merging, closing PRs: ask.

**Done means:** `READY TO MERGE` or `NOT READY` verdict, owner per open item, nothing fixable left unfixed. After merge: issue Done; worktree, branch, `<repo>/.claude/worktrees/.ship/<ISSUE>/` gone. Turns end per SKILL.md ("How turns end"): in `land` sweeps, report PR in one short block, continue next one same message.

Track progress in `<repo>/.claude/worktrees/.ship/<ISSUE>/state.md`, same as `ship`.

## Conflict-only or update-branch request

"Resolve conflicts in PR #n" or "update the branch" still `land` run, shorter. Do in order:

1. Steps 1-2 below (context, worktree).
2. Step 4 (merge `origin/main`, signed merge commit). Then `git submodule update --init --recursive` and `pnpm install --frozen-lockfile`: `main` may have moved pin or lockfile.
3. Check fix survived merge: read PR's own hunks on merged tree.
4. Step 6 delta review only if resolution edited non-test source, or files merged from `main` overlap PR's hunks.
5. Step 7 in full: checks, push, `gh pr checks <n> --watch` until done. Never report while CI runs.
6. PR has no Before/After table and change device-testable → step 8's device run too.
7. Step 9, then one verdict line: conflicts resolved in which files, CI result, whether delta review and device run happened (and why not).

## Open PR → merge-ready

1. **Context:** `gh pr view <n> --json title,body,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,commits`, plus linked Linear issue.
2. **Worktree:** reuse `<repo>/.claude/worktrees/<issue>` if on PR branch. Else `git worktree add <repo>/.claude/worktrees/<issue> <headRefName>` after `git fetch origin`, then rest of SKILL.md phase 2 (`.env` symlink, `local.properties`, submodules, `pnpm install`). Never touch main checkout.
3. **Still relevant?** Issue still open? `main` moved under it? Check if code merged since PR opened already fixes bug, or changed code path so fix now wrong/incomplete. PR obsolete → say so with evidence, stop for this PR.
4. **Conflicts or behind:** merge `origin/main` into branch, resolve (no force-push). Same when `mergeStateStatus` is `BEHIND` with no conflicts: branch protection wants it current. Rebase only if user asks; ask before required force-push; say what it changes for reviewers. After resolving, re-check fix against new `main` code. Merges can silently undo it.
5. **Review threads:** list unresolved:
   ```
   gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{author{login} body url}}}}}}}' -f o=nimiq -f r=nimiq-pay-app -F n=<n>
   ```
   Each: check claim against code.
   - Real: fix, reply with commit SHA + one line, then resolve: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread id>`.
   - Wrong or out of scope: reply with reason, leave unresolved for human.
   - Also read bot comments (CodeQL, CLA, CI annotations), handle real ones.
6. **Delta review:** run repo `reviewer` agent on changes since last-reviewed commit, with brief in `references/review.md`, round N, prior findings. Fix `Important` findings. Budget: 3 rounds (SKILL.md phase 5); each new batch of outside review feedback gets own 3. Open finding goes under **Blocked on me** in plain words: what user or Mini App sees, plus concrete fix, so answer can be "fix it".
7. **Checks:** run lint, typecheck, tests in worktree. Push. Then `gh pr checks <n> --watch`. Fix failures caused by this PR. Failures also on `main`: link failing main run, don't fix here.
8. **Description and evidence:**
   - Body matches current diff.
   - `Closes` vs `Refs` right: `Closes` only if PR fully fixes issue.
   - Impact matrix still true.
   - No Before/After table and change device-testable → run SKILL.md phase 7 now, don't ask.
   - Behavior changed since screenshots → retake (SKILL.md phase 7, incl. screenshot check), re-upload (`references/pr.md`).
   - `READY TO MERGE` needs device evidence for current head whenever behavior changed. Never list missing device test under Found instead.
9. **Signatures:** every commit on branch shows Verified on GitHub.
10. **Verdict:** give `READY TO MERGE`, or `NOT READY` with what's left + owner per item. Don't merge.

## After merge (PR state `MERGED`)

Run when user says "merged", and in `land` sweeps for already-merged PRs:

1. **Linear:** issue should be Done via `Closes`. If not and PR fully fixed it, close with one-line comment linking PR.
2. **Worktree:** `git -C <worktree> status --porcelain` must be empty, or every change already in merged PR. Else list leftovers, keep worktree. Also check submodule clean (`git -C <worktree>/vendor/trust-web3-provider status --porcelain`). Then `git worktree remove --force <worktree>`: git refuses removing worktrees with submodules without `--force`, so clean checks above are safety net.
3. **Branch:** confirm merged via `gh pr view <n> --json state` (squash merges make `git branch -d` refuse), then `git branch -D <branch>`. Delete remote branch only if GitHub didn't already (`git ls-remote --heads origin <branch>`).
4. Remove `<repo>/.claude/worktrees/.ship/<ISSUE>/`.
5. Report one line per PR: merged, issue state, cleaned.

## Report

Use same three headings as `ship`. Changed: commits pushed, threads resolved, PRs cleaned. Found: obsolete PRs, threads left open for human, pre-existing CI failures.