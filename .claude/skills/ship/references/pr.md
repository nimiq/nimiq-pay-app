# PR body

Keep short; user reviews from table. Run prose through `humanizer`. No local paths, full addresses, balances, recovery words or PIN.

```markdown
<one paragraph: what was wrong, from the user's point of view, and the root cause>

<one paragraph: what changed and why this is the minimal fix>

### Impact
| Who | Effect |
|---|---|
| New install | … |
| Upgraded from older version | … (migrations, stored state) |
| Normal user | … |
| Power user (many txs/HTLCs) | … |
| Users already in the broken state | … (do they recover automatically?) |
| NIM / USDT | … |
| Android / iOS | … |
| Mini App devs | … (only if the provider or SDK is touched) |

<drop rows that are plainly "no change"; keep at least the first five>
How often this happens in production: <PostHog number + query window, or "unconfirmed: <why>">

### Tested on <Android 13 Xiaomi / iPhone 15 iOS 27> (<testnet|mainnet>)
| Scenario | Before (main) | After (this PR) |
|---|---|---|
| <scenario> | <short text><br><img width="180" alt="…" src="…"> | <short text><br><img width="180" alt="…" src="…"> |

Unit tests: <what the new tests cover>

### Decisions
- <alternative not taken and why> (omit section if none)

Closes <ISSUE>
```

Use `Refs <ISSUE>` instead of `Closes` only when PR deliberately fixes part of issue. Say which part remains.

## Screenshot upload

GitHub has no API for PR image attachments, so images go through user's signed-in browser. Uploaded files persist **only if the form is saved**: upload then Cancel → URLs 404 forever.

Sessions started from T3 Code have no Claude in Chrome tools and no `/chrome`, even with extension installed. So script calls headless `claude -p --chrome`; use without asking.

1. Open PR first, table text in place, image cells empty.
2. `scripts/upload-shots.sh <pr-number> <png>...` appends images to end of PR description in browser editor, clicks **Update**, prints `https://github.com/user-attachments/assets/…` URLs as JSON.
3. Pull body (`gh pr view <n> --json body --jq .body`), move each `<img>` into its table cell, delete appended block, normalize CRLF to LF, then `gh pr edit <n> --body-file <file>`. Check with `gh pr view` every row has its images.
4. If script prints `FAILED`, retry once. Still fails → leave table text-only, list local PNG paths under **Blocked on me**, continue.