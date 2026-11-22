# PR body

Keep short; user reviews from table. Run prose through `humanizer`. No local paths, full addresses, balances, recovery words, PIN.

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
| <scenario> | <short text><br>![Before: <scenario>](./pr-<scenario>-before.png) | <short text><br>![After: <scenario>](./pr-<scenario>-after.png) |

Unit tests: <what the new tests cover>

### Decisions
- <alternative not taken and why> (omit section if none)

Closes <ISSUE>
```

Use `Refs <ISSUE>` not `Closes` only when PR deliberately fixes part of issue. Say which part remains.

## Screenshots

`gh` 2.103+ uploads images itself with `--attach`; no browser needed. Uploaded image can't be deleted (asset URL + PR edit history keep it).

1. Make PR copies in `<state>`: `sips -Z 700 <png> --out <state>/pr-<scenario>-<before|after>.png`. Open each copy, run SKILL.md phase 7 check on it — this file gets uploaded.
2. Write body to `<state>/pr-body.md`, next to copies. Image cells use markdown refs, as in template: `![Before: <scenario>](./pr-<scenario>-before.png)`.
3. Run from `<state>` so body refs and `--attach` paths resolve to same files. New PR (after push): `cd <state> && gh pr create --repo <owner/repo> --base main --head <branch> --title "<subject>" --body-file pr-body.md --attach './pr-<scenario>-before.png#Before: <scenario>' …` (one `--attach` per image; `--head` because `<state>` sits in main checkout). Existing PR: `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body.md --attach …`. gh uploads each file, rewrites its `./` ref to asset URL.
4. Check: `gh pr view <n> --json body --jq .body` contains one `user-attachments/assets` URL per image, no `](./` left.
5. Partial failure: gh exits nonzero but saves what uploaded. Save current body (`gh pr view <n> --json body --jq .body > <state>/pr-body-now.md`, normalize CRLF to LF), then `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body-now.md --attach` only missing files. Still failing → leave those cells text-only, list local PNG paths under **Blocked on me**, continue.