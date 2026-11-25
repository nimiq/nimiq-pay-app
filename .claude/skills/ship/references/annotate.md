# Annotated Before/After

One file per scenario: Before and After side by side, hand-drawn marks on what changed, handwritten notes with arrows saying what changed. Reader sees change without reading table text. `scripts/annotate.mjs` renders it; output goes in PR table (`references/pr.md`).

## Pick the form

| Scenario shows | Build |
|---|---|
| change on one screen | still PNG (default) |
| change over time: spinner, flicker, skeleton, animation, scroll, hang, timeout, resume | clip `.mp4` + still PNG from same spec |
| flow across several screens | flow PNG: several frames per side |
| logs, file listings, counts, no visible UI | text image of the log, then still PNG |
| nothing runs on device (CI, docs, tooling) | no image; one-line reason (SKILL.md phase 7) |

## 1. Capture

Name raw files `<scenario>-before.<ext>` / `<scenario>-after.<ext>` in `<state>`; flows `<scenario>-before-1.png`, `-before-2.png`, … Suffix picks colors (Before Nimiq red, After Nimiq green, faint After marks). Same capture method on both sides. Run SKILL.md phase 7 check on every raw file.

- **App screen, Android:** `cdp-shot.mjs` saves WebView screenshot and prints exact boxes, no measuring by eye. Forward WebView (`adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.nimiq.pay.debug)`), then `node <repo>/.claude/skills/ship/scripts/cdp-shot.mjs <state>/<scenario>-before.png 'text:Payment preview' 'text:Pending'`. Targets: CSS selector or `text:<visible text>` (smallest visible element containing it; light DOM only). Prints `viewport="WxH"` and one `::::annotation{…}` per target; exits nonzero when a target isn't in WebView DOM. Capture = WebView only: no status bar, no native toasts, and an open keyboard shrinks it to the area above the keyboard. Remove forward when done (device.md "When done").
- **Native UI in scenario** (native dialogs and sheets: Mini App confirmations via `capacitor-extended-dialog`, permission prompts; status or nav bar overlap, keyboard, notification shade, app switcher), **iOS**, or `cdp-shot` fails: device screenshot (device.md), measure by eye: element edge px / image width or height × 100, same scale both axes.
- **Clip:** record both sides with agent-device `record` (T3 device rules), same action, same window. Trim to ≤ 20 s around action: `ffmpeg -y -ss <start> -t <seconds> -i raw.mp4 -an <scenario>-before.mp4`. Poster frame = state notes point at: `ffmpeg -y -ss <s> -i <scenario>-before.mp4 -frames:v 1 <scenario>-before.png`. Measure boxes on poster frames, as on device screenshots.
- **Log or listing:** save rows that show change plus 2-3 neighbors for context (≤ 30 lines) as `<scenario>-before.txt`. Keep lines ≤ 60 chars: drop columns that don't matter (logcat: message only) (`ls -la` → size, date, name: `perl -lane 'print join " ", @F[4..$#F]'`). Same columns both sides → same scale, no crop. Then `node <repo>/.claude/skills/ship/scripts/annotate.mjs <state>/<scenario>-before.txt <state>/<scenario>-before.png '<row regex>'`. Prints `viewport` plus `highlight` annotation per matching row, side picked from file name.
- **Wide or composite screenshot** (landscape, phone + log panel): crop both sides to region showing change, same crop: `magick in.png -crop WxH+X+Y +repage <scenario>-before.png`. Each image gets ~30% of final width; text must stay readable.

## 2. Spec

Write `<state>/<scenario>.annotate.md`. Example (APP-145, PR #164):

```md
:::screenshot{src="connect-before.png" alt="Before: Connect sheet in English, app set to Spanish" viewport="1080x2400" title="Before (main 8c9a0958)"}
::::annotation{x=14 y=55.5 w=72 h=7 side="left"}
Title in English
::::
::::annotation{x=5.5 y=65.5 w=89 h=12.5 side="left"}
Permissions in English
::::
:::

:::screenshot{src="connect-after.png" alt="After: Connect sheet in Spanish" viewport="1080x2400" title="After (8c9a0958-6b4a1bf6)"}
::::annotation{x=14 y=55.5 w=72 h=7 side="right"}
Title in Spanish, app name filled in
::::
::::annotation{x=5.5 y=65.5 w=89 h=12.5 side="right"}
Permissions translated
::::
App language: **Español**
:::
```

- `viewport` = raw PNG size (`cdp-shot` and text mode print it; else `sips -g pixelWidth -g pixelHeight <png>`).
- `title` carries build stamp from `verify-build.sh`: `Before (main <sha8>)`, `After (<stamp, sha8 parts>)`. Bundled or prod build: say so ("After (bundled 8c9a0958-6b4a1bf6)").
- Caption = Markdown line after annotations, inside block. Put measured numbers there (time to state, cold start, file size, call count) and state that isn't visible (language, network, wallet). Timing scenario without a number = measure it first.
- Before marks what is wrong. After marks what replaced it. Missing element (off-screen, not rendered): mark what shows in its place.
- `mark` (hand-drawn marks from AnnotationKit, annotationkit.vercel.app): `box` (default) for block or region, `circle` for small target (icon, spinner, badge), `underline` for one line of text with space below, `highlight` for one row in dense list or log (box and underline spill onto neighbor rows). Skip `cross` (hides what it marks) and `check` (invisible at faint After opacity).
- Note: what changed, ≤ 7 words. Real values when they matter ("Still spinning 94 s after tapping Pay").
- Boxes: hug element edges; drawn box adds own padding. Box around centered content stays centered (x + w/2 = 50). Stacked boxes share `x` and `w`. Same element gets same box on both sides.
- Notes, one frame per side: Before `side="left"`, After `side="right"`. Arrow would cross another element: both screenshots' notes on one side with clear path (`right` or `bottom`); target's own container (spinner inside button) doesn't count. Every screenshot gets ≥ 1 note on same side set, else it renders bigger than its pair.
- Notes too close on one side (`check` says they overlap): `at=<percent>` moves note along its side.
- Element spans ≥ 90% of width: box merges with image edge, so inset box ~2% or use `highlight`.
- Flow (several frames per side): Before row on top, After row below. Counts may differ per side. `title` names step ("After 2/3: language"). Notes `top` or `bottom`, whichever edge is nearer target.
- Extra state on one side only (After right after cold start): flow frame, or caption when it has nothing to look at.
- Plain `:::screenshot` blocks. `::compare` silently drops left/right notes. No `color`: script sets it.

## 3. Render

`node <repo>/.claude/skills/ship/scripts/annotate.mjs <state>/<scenario>.annotate.md <state>/pr-<scenario>.png`

- Clip: same spec, output `pr-<scenario>.mp4`. Every `src` needs same-name `.mp4` next to it. Marks and notes stay fixed while clips play; shorter clip holds last frame. Warns over 10 MB (GitHub free-plan limit): trim.
- First run needs network: pinned packages into `<repo>/.claude/worktrees/.ship/.annotate`, plus Playwright's Chromium. Codex: run outside sandbox (escalated); macOS sandbox kills Chromium at launch (`bootstrap_check_in ... Permission denied (1100)`).
- `comark-annotate check` problem: fix spec, re-run.

## 4. Check

Open `pr-<scenario>.png`: every box on its element, notes don't overlap or clip, arrows point at right box. After marks are faint: crop and zoom After half to check them. Clip: extract frames at start, at moment notes describe (middle for hangs), and at end (`ffmpeg -ss <s> -i pr-<scenario>.mp4 -frames:v 1 f.png`), check same. Fix spec, re-run. These files get uploaded.
