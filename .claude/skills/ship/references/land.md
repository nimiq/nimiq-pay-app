# `land`: from open PR to merged and cleaned up

`/ship land <PR>` takes one PR. `/ship land` no number → every open PR of user's in nimiq/nimiq-pay-app, most important first, one after another. Invoking authorizes commits + normal pushes to PR branch. Does **not** authorize force-pushes, merging, closing PRs: ask.

**Done means:** `READY TO MERGE` or `NOT READY` verdict, owner for every open item, nothing fixable left unfixed. After merge: issue Done, worktree, branch, `/tmp/ship/<ISSUE>/` gone. Turns end per SKILL.md ("How turns end"): in `land` sweeps, report PR in one short block, continue next one same message.

Track progress in `/tmp/ship/<ISSUE>/state.md`, same as `ship`.

## Open PR → merge-ready

1. **Context:** `gh pr view <n> --json title,body,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,commits`, plus linked Linear issue.
2. **Worktree:** reuse `<repo>/.claude/worktrees/<app-id>` if on PR branch. Else `git worktree add <repo>/.claude/worktrees/<app-id> <headRefName>` after `git fetch origin`. Never touch main checkout.
3. **Still relevant?** Issue still open? `main` moved under it? Check if code merged since PR opened already fixes bug, or changed code path so fix now wrong/incomplete. PR obsolete → say so with evidence, stop for this PR.
4. **Conflicts:** merge `origin/main` into branch, resolve (no force-push). Rebase only if user asks; ask before required force-push; say what it changes for reviewers. After resolving, re-check fix against new `main` code. Merges can silently undo it.
5. **Review threads:** list unresolved:
   ```
   gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{author{login} body url}}}}}}}' -f o=nimiq -f r=nimiq-pay-app -F n=<n>
   ```
   Each: check claim against code.
   - Real: fix, reply with commit SHA + one line, then resolve: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread id>`.
   - Wrong or out of scope: reply with reason, leave unresolved for human.
   - Also read bot comments (CodeQL, CLA, CI annotations), handle real ones.
6. **Delta review:** run repo `reviewer` agent on changes since last-reviewed commit, with brief in `references/review.md`, round N, prior findings. Fix `Important` findings.
7. **Checks:** lint, typecheck, tests in worktree. Push. Then `gh pr checks <n> --watch`. Fix failures caused by this PR. Failures also on `main`: link failing main run, don't fix here.
8. **Description and evidence:**
   - Body matches current diff.
   - `Closes` vs `Refs` right: `Closes` only if PR fully fixes issue.
   - Impact matrix still true.
   - Behavior changed since screenshots → retake (SKILL.md phase 7, incl. screenshot check), re-upload.
9. **Signatures:** every commit on branch shows Verified on GitHub.
10. **Verdict:** `READY TO MERGE`, or `NOT READY` with what's left + owner per item. Don't merge.

## After merge (PR state `MERGED`)

Run when user says "merged", and in `land` sweeps for already-merged PRs:

1. **Linear:** issue should be Done via `Closes`. If not and PR fully fixed it, close with one-line comment linking PR.
2. **Worktree:** `git -C <worktree> status --porcelain` must be empty, or every change already in merged PR. Else list leftovers, keep worktree. Also check submodule clean (`git -C <worktree>/vendor/trust-web3-provider status --porcelain`). Then `git worktree remove --force <worktree>`: git refuses removing worktrees with submodules without `--force`, so clean checks above are safety net.
3. **Branch:** confirm merged via `gh pr view <n> --json state` (squash merges make `git branch -d` refuse), then `git branch -D <branch>`. Delete remote branch only if GitHub didn't already (`git ls-remote --heads origin <branch>`).
4. Remove `/tmp/ship/<ISSUE>/`.
5. Report one line per PR: merged, issue state, cleaned.

## Report

Same three headings as `ship`. Changed: commits pushed, threads resolved, PRs cleaned. Found: obsolete PRs, threads left open for human, pre-existing CI failures.