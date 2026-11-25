export const meta = {
  name: 'ship-batch',
  description: 'Ship several Nimiq Pay Linear issues: plan mode (intake + root cause + trade-offs) or run mode (fix, review, device test, PR)',
  whenToUse: 'From the /ship skill with 2+ issues. Call with mode "plan" first, ask the user about needs_approval items, then mode "run".',
  phases: [
    { title: 'Plan', detail: 'intake, still on main?, root cause, options' },
    { title: 'Fix', detail: 'own worktree, minimal fix + tests, checks, simplify' },
    { title: 'Review', detail: 'repo reviewer agent, fix loop on default model' },
    { title: 'Final review', detail: 'one strongest-model pass per issue', model: 'fable' },
    { title: 'Device', detail: 'Before/After on device, one issue at a time' },
    { title: 'Ship', detail: 'signed commit, push, PR with screenshots, Linear comment' },
  ],
}

// args: { mode: 'plan', repo, branchPrefix, issues: ['<ISSUE>', ...] }
//    or { mode: 'run', repo, branchPrefix, issues: [{ id, approach, branchSlug, deviceTestable, devicePlan, decisions, finalReviewDone?, holdShip? }] }
if (!args || !args.repo) throw new Error('args.repo (absolute path of the main checkout) is required')
const REPO = args.repo
const SKILL = `${REPO}/.claude/skills/ship`
const PREFIX = args.branchPrefix || 'ship'
// Inside the gitignored worktrees dir so state survives reboots (/tmp doesn't).
const OUT = `${REPO}/.claude/worktrees/.ship`
const MAX_REVIEW_ROUNDS = 3

const RULES = `
Rules: work only inside your own worktree (git -C <worktree> ...); never touch the main checkout or other worktrees, never git stash. Never force-push. Commits are signed by the user's git config: check with git log --show-signature -1. No Co-Authored-By, "Generated with" or any AI attribution. Keep notes in ${OUT}/<ISSUE>/state.md (append what you did and the result).`

function sem(max) {
  let active = 0
  const q = []
  return async fn => {
    if (active >= max) await new Promise(r => q.push(r))
    active++
    try { return await fn() } finally { active--; const n = q.shift(); if (n) n() }
  }
}
// One phone + one :8100. The lock lives in this run only: never start two runs at once.
const chain = () => { let c = Promise.resolve(); return fn => { const r = c.then(fn, fn); c = r.catch(() => null); return r } }
const slot = sem(3)
const limited = (p, o) => slot(() => agent(p, o))
const withDevice = chain()

const PLAN = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string', enum: ['ready', 'needs_approval', 'already_solved', 'has_open_pr', 'not_a_bug', 'blocked'] },
    evidence: { type: 'string', description: 'commit/PR/file:line on origin/main backing the status' },
    rootCause: { type: 'string', description: '2-4 sentences' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, tradeoff: { type: 'string' }, affects: { type: 'string' } },
        required: ['name', 'tradeoff'],
      },
      description: 'only when status is needs_approval: 2-3 options',
    },
    approach: { type: 'string', description: 'the recommended fix, concrete enough to implement' },
    branchSlug: { type: 'string', description: 'short-kebab-slug for <prefix>/<issue>-<slug>' },
    deviceTestable: { type: 'boolean' },
    devicePlan: { type: 'string', description: 'scenarios showing the bug on main and the fix on the branch, or why not testable' },
  },
  required: ['id', 'status', 'evidence'],
}

const IMPL = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready', 'already_solved', 'failed'] },
    worktree: { type: 'string' },
    branch: { type: 'string' },
    summary: { type: 'string', description: 'root cause + fix, 2-4 sentences, or why failed' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string', description: 'lint/typecheck/vitest with exit codes' },
  },
  required: ['status', 'summary'],
}

const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string', enum: ['Important', 'Pre-existing'] },
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          failsWhen: { type: 'string' },
          reachable: { type: 'string', description: 'reachable in production? how' },
          who: { type: 'string' },
          worstCase: { type: 'string' },
        },
        required: ['tag', 'file', 'problem', 'failsWhen'],
      },
    },
    rootCauseFixed: { type: 'boolean' },
  },
  required: ['findings', 'rootCauseFixed'],
}

const REVIEW_ROUND = {
  ...REVIEW,
  properties: { ...REVIEW.properties, humanReviewRequired: { type: 'boolean', description: 'true when your HUMAN REVIEW line says required' } },
  required: [...REVIEW.required, 'humanReviewRequired'],
}

const FIXED = {
  type: 'object',
  properties: {
    applied: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' }, description: 'finding + one-line reason' },
    checks: { type: 'string' },
  },
  required: ['applied', 'rejected'],
}

const DEVICE = {
  type: 'object',
  properties: {
    tested: { type: 'boolean' },
    platform: { type: 'string' },
    table: { type: 'string', description: 'markdown test table per references/pr.md: one ./pr-<scenario>.png ref per scenario, clip lines under it' },
    screenshots: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string', description: 'annotated pr-<scenario>.png or .mp4' }, scenario: { type: 'string' } },
        required: ['path', 'scenario'],
      },
    },
    regression: { type: 'string', description: 'non-empty if the fix broke something on device' },
    blockedOnUser: { type: 'string', description: 'e.g. phone locked with OS PIN, iPhone needs unlock' },
  },
  required: ['tested'],
}

const SHIPPED = {
  type: 'object',
  properties: {
    prUrl: { type: 'string' },
    prNumber: { type: 'number' },
    verified: { type: 'boolean', description: 'GitHub shows Verified on the commit' },
    ci: { type: 'string' },
    draft: { type: 'boolean' },
    screenshots: { type: 'number', description: 'images attached and shown in the PR body' },
    screenshotFailure: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['notes'],
}

const issues = (args && args.issues) || []
if (!issues.length) throw new Error('args.issues is empty')

if (args.mode === 'plan') {
  phase('Plan')
  const plans = await parallel(issues.map(id => () => limited(
    `Plan Linear issue ${id} for nimiq/nimiq-pay-app (repo ${REPO}). Read-only: no worktree, no edits, no Linear or GitHub writes.
Follow phases 1 and 3 of ${SKILL}/SKILL.md: read the issue with comments and images (Linear tools via ToolSearch), check for open/merged PRs and branches about it (gh pr list --repo nimiq/nimiq-pay-app --state all --search "${id}"), git fetch origin and check whether it still happens on origin/main (line refs in old issues are stale; locate by symbol), then find the root cause.
Status: already_solved / not_a_bug / has_open_pr with evidence; needs_approval only for real trade-offs as SKILL.md phase 3 defines them (behavior, data/migration, funds/sync/power-user risk, scope, other repos); else ready.
Device: read ${SKILL}/references/device.md and decide if a device test can show the bug (USDT HTLC on testnet, CI, docs = not testable).`,
    { label: `plan:${id}`, phase: 'Plan', schema: PLAN },
  )))
  return plans.map((p, i) => p || { id: issues[i], status: 'blocked', evidence: 'planner failed' })
}

if (args.mode !== 'run') throw new Error('args.mode must be "plan" or "run"')

const results = await pipeline(
  issues,

  // Fix
  (it) => limited(
    `Implement the fix for Linear issue ${it.id} in nimiq/nimiq-pay-app. Approved approach: ${it.approach}
Follow phases 2 and 4 of ${SKILL}/SKILL.md. Worktree ${REPO}/.claude/worktrees/${it.id.toLowerCase()} on branch ${PREFIX}/${it.id.toLowerCase()}-${it.branchSlug} from origin/main (the phase 2 commands: ln -s .env, never copy or read it; copy android/local.properties; submodule update; pnpm install). If that worktree already exists from an earlier attempt at this same issue, reuse it and keep what is right.
First re-check it still happens on origin/main; if not, status already_solved with the commit.
Minimal root-cause fix plus vitest coverage that fails on main. Run pnpm lint, pnpm typecheck, pnpm vitest run (exit codes all 0), then the simplify skill on your diff. Do NOT commit.${RULES}`,
    { label: `fix:${it.id}`, phase: 'Fix', schema: IMPL },
  ),

  // Review loop on the default model
  async (impl, it) => {
    if (!impl || impl.status !== 'ready') return { it, impl }
    const prior = []
    let review = null
    let humanReviewRequired = false
    for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
      review = await limited(
        `Review round ${round} for Linear issue ${it.id} (nimiq/nimiq-pay-app). Worktree ${impl.worktree}; diff: git -C ${impl.worktree} diff --merge-base origin/main plus untracked files (git -C ${impl.worktree} ls-files --others --exclude-standard). Intent: ${impl.summary}
Use the brief in ${SKILL}/references/review.md as INTENT: every finding needs reachable-in-production, who, worst case. Set humanReviewRequired from your HUMAN REVIEW line.
Prior findings (do not repeat): ${JSON.stringify(prior)}`,
        { label: `review:${it.id}:r${round}`, phase: 'Review', agentType: 'reviewer', schema: REVIEW_ROUND },
      )
      humanReviewRequired ||= Boolean(review && review.humanReviewRequired)
      const blocking = review ? review.findings.filter(f => f.tag === 'Important') : []
      if (!blocking.length && (!review || review.rootCauseFixed)) break
      const fix = await limited(
        `Fix these review findings for ${it.id} in worktree ${impl.worktree} where real (check the evidence first; reviewers can be wrong). Minimal, in scope; reject wrong or scope-widening ones with a one-line reason. ${review.rootCauseFixed ? '' : 'The reviewer says the root cause is NOT fixed: address that first.'}
Re-run pnpm lint, pnpm typecheck, pnpm vitest run. Do NOT commit.
Findings: ${JSON.stringify(blocking)}${RULES}`,
        { label: `refix:${it.id}:r${round}`, phase: 'Review', schema: FIXED },
      )
      prior.push(...blocking.map(f => ({ ...f, handled: fix })))
      if (round === MAX_REVIEW_ROUNDS) log(`${it.id}: review cap of ${MAX_REVIEW_ROUNDS} rounds reached, continuing to final review`)
    }
    return { it, impl, review, prior, humanReviewRequired }
  },

  // Security review, only when a reviewer round flagged a sensitive change
  async (s) => {
    if (!s || !s.review || !s.humanReviewRequired) return s
    const { it, impl } = s
    const security = await limited(
      `Security review for Linear issue ${it.id} (nimiq/nimiq-pay-app). Worktree ${impl.worktree}; diff: git -C ${impl.worktree} diff --merge-base origin/main plus untracked files (git -C ${impl.worktree} ls-files --others --exclude-standard). Intent: ${impl.summary}
Use "Security brief" in ${SKILL}/references/review.md. Set rootCauseFixed true: this pass doesn't judge it. Read-only.`,
      { label: `security:${it.id}`, phase: 'Review', schema: REVIEW },
    )
    // review: null makes every later stage skip, so no PR opens without this pass
    if (!security) return { ...s, review: null, stopped: 'security review failed, re-run it before shipping' }
    const blocking = security.findings.filter(f => f.tag === 'Important')
    if (!blocking.length) return { ...s, security }
    const fix = await limited(
      `Fix these security findings for ${it.id} in worktree ${impl.worktree} where real (check the evidence first; reviewers can be wrong). Reject wrong ones with a one-line reason. Re-run pnpm lint, pnpm typecheck, pnpm vitest run. Do NOT commit.
Findings: ${JSON.stringify(blocking)}${RULES}`,
      { label: `securityfix:${it.id}`, phase: 'Review', schema: FIXED },
    )
    const recheck = await limited(
      `Re-check these security findings for ${it.id}. Worktree ${impl.worktree}; diff: git -C ${impl.worktree} diff --merge-base origin/main plus untracked files. Report as Important each one still open, and anything the fix broke. Findings: ${JSON.stringify(blocking)}. Fix notes: ${JSON.stringify(fix)}. Use "Security brief" in ${SKILL}/references/review.md. Set rootCauseFixed true: this pass doesn't judge it. Read-only.`,
      { label: `securitycheck:${it.id}`, phase: 'Review', schema: REVIEW },
    )
    const open = recheck && recheck.findings.filter(f => f.tag === 'Important')
    if (!fix || !open || open.length) return { ...s, review: null, security, stopped: `security findings still open: ${JSON.stringify(fix && open ? open : blocking)}` }
    return { ...s, security, prior: [...s.prior, ...blocking.map(f => ({ ...f, handled: fix }))] }
  },

  // One final strongest-model review; re-check on the default model if it finds blockers
  async (s) => {
    if (!s || !s.review) return s
    const { it, impl } = s
    if (it.finalReviewDone) return s
    const final = await limited(
      `Final merge-blocking review for Linear issue ${it.id} (nimiq/nimiq-pay-app). Worktree ${impl.worktree}; diff: git -C ${impl.worktree} diff --merge-base origin/main plus untracked files. Intent: ${impl.summary}
Use the brief in ${SKILL}/references/review.md. Already handled (do not repeat): ${JSON.stringify(s.prior)}. Read-only.`,
      { label: `final:${it.id}`, phase: 'Final review', model: 'fable', effort: 'high', schema: REVIEW },
    )
    const blocking = final ? final.findings.filter(f => f.tag === 'Important') : []
    if (!blocking.length) return { ...s, final }
    const fix = await limited(
      `Fix these final-review findings for ${it.id} in worktree ${impl.worktree} where real; reject wrong ones with a reason. Re-run pnpm lint, pnpm typecheck, pnpm vitest run. Do NOT commit.
Findings: ${JSON.stringify(blocking)}${RULES}`,
      { label: `finalfix:${it.id}`, phase: 'Final review', schema: FIXED },
    )
    const recheck = await limited(
      `Re-check that these findings for ${it.id} are fixed and nothing new broke. Worktree ${impl.worktree}; diff: git -C ${impl.worktree} diff --merge-base origin/main plus untracked files. Findings: ${JSON.stringify(blocking)}. Fix notes: ${JSON.stringify(fix)}. Use the brief in ${SKILL}/references/review.md.`,
      { label: `recheck:${it.id}`, phase: 'Final review', agentType: 'reviewer', schema: REVIEW },
    )
    return { ...s, final, finalFix: fix, recheck }
  },

  // Device, serialized
  async (s) => {
    if (!s || !s.review) return s
    const { it, impl } = s
    if (!it.deviceTestable) return { ...s, device: { tested: false, table: `Not device-tested: ${it.devicePlan || 'not testable'}` } }
    const device = await withDevice(() => limited(
      `On-device Before/After test for Linear issue ${it.id}. After = worktree ${impl.worktree} (uncommitted fix). Plan: ${it.devicePlan}
Read ${SKILL}/references/device.md and run ${SKILL}/scripts/device-preflight.sh first. You hold the only device lock. Prefer Android (needs no user input). If the only usable device needs the user (OS PIN, iPhone unlock), don't wait: return blockedOnUser.
Use agent-device session name ship-${it.id.toLowerCase()}. App language English unless the scenario tests a language. Capture into ${OUT}/${it.id}/ per ${SKILL}/references/annotate.md (still, clip, flow or log image; measure time-based scenarios), then build annotated ${OUT}/${it.id}/pr-<scenario>.png (and .mp4 for time-based ones) and return those paths. No full addresses, balances, words or PIN in frames. Before returning, open every raw capture and every annotated file and confirm it shows its scenario, the right asset (NIM vs USDT), bug-on-Before / fix-on-After, and boxes on their elements; retake or fix failures. Finish with "When done" in device.md, except the servers: later issues need :8100, so always kill yours and leave the main-baseline server on :8100. If you return blockedOnUser, name the worktree the user must test in it; the main session serves it later.${RULES}`,
      { label: `device:${it.id}`, phase: 'Device', schema: DEVICE },
    ))
    return { ...s, device }
  },

  // Ship
  async (s) => {
    if (!s || !s.review) return s
    const { it, impl, device } = s
    if (device && device.regression) return { ...s, stopped: `device regression: ${device.regression}` }
    if (it.holdShip) return { ...s, stopped: `held before commit: ${it.holdShip}` }
    const shots = (device && device.screenshots) || []
    const draft = Boolean(device && device.blockedOnUser)
    const shipped = await limited(
      `Ship Linear issue ${it.id}: follow phase 8 of ${SKILL}/SKILL.md. Worktree ${impl.worktree}, branch ${impl.branch}, base main.
PR body from ${SKILL}/references/pr.md through the humanizer skill. Summary: ${impl.summary}
Impact: fill the matrix yourself from the diff; query PostHog if available, else mark unconfirmed.
Test table for the body: ${device ? device.table : 'not tested'}
Screenshots: ${shots.length ? `${JSON.stringify(shots)}. Attach them with gh --attach per "Screenshots" in ${SKILL}/references/pr.md: open each file first, skip mismatches and report them in screenshotFailure, then check every cell shows its image. Return the attached count in screenshots.` : 'none, screenshots = 0.'}
${draft ? `The device test is still blocked (${device.blockedOnUser}): open the PR as a draft (gh pr create --draft) and say so in the body.\n` : ''}Decisions: ${it.decisions || 'none'}. Rejected review findings: ${JSON.stringify(s.prior || [])}
Stage only the fix files. One signed commit, last line "Closes ${it.id}". Push, gh pr create, link_pull_request if the t3-code tools exist, one-line Linear comment with the full PR URL. Watch CI and fix failures your change causes.${RULES}`,
      { label: `ship:${it.id}`, phase: 'Ship', schema: SHIPPED },
    )
    return { ...s, shipped: shipped && { ...shipped, draft } }
  },
)

return results.map((r, i) => {
  const id = issues[i].id
  if (!r) return { id, failed: true }
  return {
    id,
    status: r.stopped || (r.impl && r.impl.status),
    summary: r.impl && r.impl.summary,
    pr: r.shipped && r.shipped.prUrl,
    verified: r.shipped && r.shipped.verified,
    ci: r.shipped && r.shipped.ci,
    rejectedFindings: (r.prior || []).filter(f => f.handled && f.handled.rejected && f.handled.rejected.length).map(f => f.handled.rejected).flat(),
    preExisting: [r.review, r.security, r.final].filter(Boolean).flatMap(v => v.findings.filter(f => f.tag === 'Pre-existing')),
    device: r.device && { tested: r.device.tested, platform: r.device.platform, blockedOnUser: r.device.blockedOnUser },
    draft: r.shipped && r.shipped.draft,
    screenshots: (r.shipped && r.shipped.screenshots) || 0,
    screenshotFailure: r.shipped && r.shipped.screenshotFailure,
    notes: r.shipped && r.shipped.notes,
  }
})
