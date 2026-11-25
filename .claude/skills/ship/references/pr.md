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
| Scenario | Before (main) → After (this PR) |
|---|---|
| <scenario> | ![Before and after: <scenario>](./pr-<scenario>.png) |
| <scenario without screenshot> | <Before text> → <After text> (logcat, timing, untestable) |

Unit tests: <what the new tests cover>

### Decisions
- <alternative not taken and why> (omit section if none)

Closes <ISSUE>
```

Use `Refs <ISSUE>` not `Closes` only when PR deliberately fixes part of issue. Say which part remains.

## Screenshots

`gh` 2.103+ uploads images itself with `--attach`; no browser needed. Uploaded image can't be deleted (asset URL + PR edit history keep it).

One PNG per scenario: Before and After side by side, hand-drawn boxes, arrows from handwritten notes that say what changed. Reader sees change without reading table text.

1. Raw device PNGs in `<state>` named `<scenario>-before.png` and `<scenario>-after.png`. Spec `src` uses these names, relative to spec. Suffix picks colors (Before Nimiq red, After Nimiq green, faint After boxes). Run SKILL.md phase 7 check on each.
2. Write `<state>/<scenario>.annotate.md`. Example (APP-145, PR #164):
   ```md
   :::screenshot{src="connect-before.png" alt="Before: Connect sheet in English, app set to Spanish" viewport="1080x2400" title="Before (main)"}
   ::::annotation{x=14 y=55.5 w=72 h=7 side="left"}
   Title in English
   ::::
   ::::annotation{x=5.5 y=65.5 w=89 h=12.5 side="left"}
   Permissions in English
   ::::
   :::

   :::screenshot{src="connect-after.png" alt="After: Connect sheet in Spanish" viewport="1080x2400" title="After (this PR)"}
   ::::annotation{x=14 y=55.5 w=72 h=7 side="right"}
   Title in Spanish, app name filled in
   ::::
   ::::annotation{x=5.5 y=65.5 w=89 h=12.5 side="right"}
   Permissions translated
   ::::
   :::
   ```
   - `viewport` = raw PNG size (`sips -g pixelWidth -g pixelHeight <png>`).
   - `x y w h` = box in percent of image: element edge px / image width or height × 100. Any scale works, same scale for both axes. Hug element edges; drawn box adds own padding.
   - Before marks what is wrong. After marks what replaced it. Missing element (off-screen, not rendered): box what shows in its place.
   - `mark` (hand-drawn marks from AnnotationKit, annotationkit.vercel.app): `box` (default) for a block or region, `circle` for a small target (icon, spinner, badge), `underline` for one line of text. Skip `cross` (hides what it marks) and `check` (invisible at faint After opacity).
   - Notes: Before `side="left"`, After `side="right"`. Arrow would cross another element to reach its box: both screenshots' notes `side="bottom"` instead, so images keep same size.
   - Note: what changed, ≤ 7 words. Real values when they matter ("Still spinning 94 s after tapping Pay").
   - Box around centered content stays centered: x + w/2 = 50. Stacked boxes share `x` and `w`. Same element gets same box on both sides.
   - Two plain `:::screenshot` blocks. `::compare` silently drops left/right notes. No `color`: script sets it.
3. Render: `node <repo>/.claude/skills/ship/scripts/annotate.mjs <state>/<scenario>.annotate.md <state>/pr-<scenario>.png`. First run needs network: installs pinned packages into `<repo>/.claude/worktrees/.ship/.annotate` and Playwright's Chromium. Codex: run it outside the sandbox (escalated); the macOS sandbox kills Chromium at launch (`bootstrap_check_in ... Permission denied (1100)`). Fails on a `comark-annotate check` problem: fix spec, re-run.
4. Open `pr-<scenario>.png`. Every box sits on its element, notes don't overlap or clip, arrows point at right box. After boxes are faint: crop and zoom After half to check them. Fix coordinates, re-run. This file gets uploaded.
5. Write body to `<state>/pr-body.md`, next to images. Image cells use markdown refs, as in template: `![Before and after: <scenario>](./pr-<scenario>.png)`.
6. Run from `<state>` so body refs and `--attach` paths resolve to same files. New PR (after push): `cd <state> && gh pr create --repo <owner/repo> --base main --head <branch> --title "<subject>" --body-file pr-body.md --attach './pr-<scenario>.png#Before and after: <scenario>' …` (one `--attach` per image; `--head` because `<state>` sits in main checkout). Existing PR: `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body.md --attach …`. gh uploads each file, rewrites its `./` ref to asset URL.
7. Check: `gh pr view <n> --json body --jq .body` contains one `user-attachments/assets` URL per image, no `](./` left.
8. Partial failure: gh exits nonzero but saves what uploaded. Save current body (`gh pr view <n> --json body --jq .body > <state>/pr-body-now.md`, normalize CRLF to LF), then `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body-now.md --attach` only missing files. Still failing → leave those cells text-only, list local PNG paths under **Blocked on me**, continue.