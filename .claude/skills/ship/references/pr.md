# PR body

Keep short. Run prose through `humanizer`, then check every code name, number and link survived. No local paths, full addresses, balances, recovery words, PIN.

Repo shape:
- Nimiq Pay or another Nimiq repo: problem + fix paragraphs, then impact and test tables ("Nimiq Pay PR"). User reviews from tables.
- Upstream repo (one we don't own): problem + fix paragraphs, testing sentence, one image, `Fixes` line ("Upstream PR"). Repo has PR template → same blocks inside its sections.

## Problem and fix paragraphs

Build each sentence from this recipe.

**Problem**, 2 sentences:
1. `On <platform>, <public API call or user action> <wrong result, as caller sees it> while <trigger>.` Trigger has concrete instances (plugins, pages, devices) → append `, such as <them>`.
2. `<exact function> <what it does>, which <why that gives the symptom>.`

**Fix**, 3 to 4 sentences, starts `This PR`:
1. `This PR <change>, <where / on which thread> and <result>, matching how <package> <does same> since #<PR>.` Precedent clause only when one exists. Thread or timing change = modifier in this sentence.
2. Edge cases the diff handles, in one sentence: `<what code does at edge>, since <reason>.`
3. Known limit or alternative not taken, when one exists, in one sentence: `<limit>; <alternative> would <cost>.`
4. Default path: `With <normal condition>, <thing> stays <where>.`

Words:
- Code names exactly as in source, in backticks: `ToastPlugin.show`, `bridge.viewController`, `@capacitor/share`. Reviewer greps them; "the bridge view controller", "the Share plugin" find nothing.
- Verb matches control flow: loop that ends at a condition "stops before" it; "skips" means it continues past.
- Reason = `since …` clause in same sentence. Sentence ends at reason; result already in default-path sentence.
- Links: markdown link with descriptive anchor (``[`with-fix` branch](…)``), not bare URL after colon.
- Image alt: `Before: <observed result + number>. After: <observed result + number>`.

## Upstream PR

Body = exactly these blocks, in order:
1. Problem paragraph
2. Fix paragraph
3. Testing, one sentence: `Tested on <device> running <OS> using <repro>, with <how change was applied> on the [<anchor>](<url>).` Ports, URLs, commits and setup steps live in linked repro.
4. Before/After image of main scenario (`references/annotate.md`). Each other scenario: own image, or one line `<scenario>: <before> → <after>`.
5. `Fixes #<issue>` alone, last line

Lint, build, CI results, recording links and review notes go in report to user.

Example, ionic-team/capacitor-plugins#2644:

```markdown
On iOS, `Toast.show()` shows nothing and resolves right away while another view controller is presented over the webview, such as `@capacitor/browser` or an in-app browser plugin. `ToastPlugin.show` always adds the toast to `bridge.viewController.view`, which sits behind the presented view controller.

This PR walks `presentedViewController` from `bridge.viewController` on the main thread and shows the toast in the topmost one, matching how `@capacitor/share` picks its presenter since #2574. The walk stops before a view controller that is being dismissed or a `UIAlertController`, since an alert's view is only the alert box. With nothing presented, the toast stays in `bridge.viewController`.

Tested on an iPhone 17 simulator running iOS 27.0 using the repro from #2643, with this change applied to 8.0.1 as a pnpm patch on the [`with-fix` branch](https://github.com/Albermonte/capacitor-toast-presented-vc-repro/tree/with-fix).

![Before: no toast while the Browser is open, `Toast.show()` resolves at 3.1 s. After: toast shown over the Browser, resolves at 7.4 s](https://raw.githubusercontent.com/Albermonte/capacitor-toast-presented-vc-repro/main/media/before-after.png)

Fixes #2643
```

## Nimiq Pay PR

Other Nimiq repos: same template, drop Pay-only rows (NIM / USDT, Mini App devs).

```markdown
<problem paragraph>

<fix paragraph>

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
| <scenario without screenshot> | <Before text> → <After text> (untestable on device) |

![Clip: <scenario>](./pr-<scenario>.mp4) (only when `references/annotate.md` picks clip)

Unit tests: <what the new tests cover>

### Decisions
- <alternative not taken and why> (omit section if none)

Closes <ISSUE>
```

Use `Refs <ISSUE>` not `Closes` only when PR deliberately fixes part of issue. Say which part remains.

## Screenshots

`gh` 2.103+ uploads images itself with `--attach`; no browser needed. Uploaded image can't be deleted (asset URL + PR edit history keep it).

Build one image per scenario (clip only when `references/annotate.md` picks one) with `references/annotate.md`, then:

1. Write body to `<state>/pr-body.md`, next to images. Image cells use markdown refs, as in template: `![Before and after: <scenario>](./pr-<scenario>.png)`. Clip: `![Clip: <scenario>](./pr-<scenario>.mp4)` on its own line under table; `--attach` uploads video too.
2. Run from `<state>` so body refs and `--attach` paths resolve to same files. New PR (after push): `cd <state> && gh pr create --repo <owner/repo> --base main --head <branch> --title "<subject>" --body-file pr-body.md --attach './pr-<scenario>.png#Before and after: <scenario>' …` (one `--attach` per image or clip; `--head` because `<state>` sits in main checkout). Existing PR: `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body.md --attach …`. gh uploads each file, rewrites its `./` ref to asset URL.
3. Check: `gh pr view <n> --json body --jq .body` contains one `user-attachments/assets` URL per image and clip, no `](./` left. Clip must render as player on PR page; if it shows as broken image, put its bare asset URL on its own line.
4. Partial failure: gh exits nonzero but saves what uploaded. Save current body (`gh pr view <n> --json body --jq .body > <state>/pr-body-now.md`, normalize CRLF to LF), then `cd <state> && gh pr edit <n> --repo <owner/repo> --body-file pr-body-now.md --attach` only missing files. Still failing → leave those cells text-only, list local PNG paths under **Blocked on me**, continue.