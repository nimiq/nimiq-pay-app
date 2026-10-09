---
name: triage-maestro-run
description: Triage a Nimiq Pay Maestro run on BrowserStack. For every flow that did not pass, a maestro-failure-triager subagent decides APP_BUG / TEST_BUG / INFRA / HARNESS / EXTERNAL / UNKNOWN from the downloaded evidence, and the results go to triage.md. Use for "why did the Maestro/BrowserStack run fail", "triage run <id>", or a local maestro-reports folder.
argument-hint: <GitHub Actions run id | folder containing maestro-reports/ and maestro-evidence/>
allowed-tools: Bash(gh run download:*) Bash(gh run view:*) Bash(unzip:*) Bash(git log:*) Bash(mkdir:*) Read Grep Glob Write
---

Triage the Maestro run `$ARGUMENTS`. This is shadow mode: report only. Never start BrowserStack builds, reruns or uploads from this skill, and never edit flows or app code.

## 1. Get the run

- A number is a GitHub Actions run id of the "Nimiq Pay - Maestro Suite Android (Suite Only)" workflow:
  `mkdir -p maestro-triage/<id> && gh run download <id> -n maestro-results -D maestro-triage/<id>`
  (`maestro-triage/` is gitignored: the evidence can show recovery words.)
- Otherwise it is a local folder that contains `maestro-reports/` and `maestro-evidence/` (e.g. output of `scripts/browserstack-maestro-run.js`).

Call the folder `RUN` below.

## 2. Pick the flows

Read every `RUN/maestro-reports/*/result.json`. Triage each flow whose `outcome` is not `PASSED`, plus `PASSED` flows whose attempts carry a `signal` (e.g. crash logs on a passing run). `NOT_RUN` flows only get a line in the report, no triager. If nothing is left, write a one-line `RUN/triage.md` and stop.

## 3. Prepare the evidence of each flow

- For each `RUN/maestro-evidence/<flow>/attempt-*/*/screenshots.zip`: `unzip -o -q <zip> -d <same folder>/screenshots`.
- Commit lists: if `appCommit` in result.json is a commit (strip a `-dirty` suffix), list at most 20 lines each:
  - in the build: `git log --oneline -20 <commit> -- src/`
  - app side, after the build (not in the tested APK): `git log --oneline <commit>..HEAD -- src/`
  - test side, after the build: `git log --oneline <commit>..HEAD -- nimiq-pay-tests/`
  If it is null or unknown, say so; the triager must then not lean on "what changed".

## 4. Run the triagers in parallel

Send ONE message with one `Agent` call per flow, `subagent_type: maestro-failure-triager`. Each prompt contains only: the flow name, the absolute paths of its `result.json`, its evidence folder, its flow file (`nimiq-pay-tests/<result.flow>`), and the three labelled commit lists from step 3. Do not paste log contents into the prompt.

## 5. Check every verdict

A verdict is valid only if:
- it is one JSON object with the documented fields and `diagnosis` is one of the six values;
- **every** `evidence` quote is found as a fixed string on its cited line, give or take 2 lines (`grep -n -F`);
- a diagnosis other than `UNKNOWN` has at least one quote from raw evidence. Quotes from `result.json` or of the rule fields (`diagnosis`, `disposition`, `signal`, `failingStep`) in `evidence.json` do not count: they repeat the rules.
- no quote contains a recovery word list, a PIN or another secret.

If only quotes fail, send that triager one follow-up (`SendMessage` to its agent id) listing each failing quote and why ("not on line N", "contains `...`"), and ask for the corrected verdict. Check the reply the same way; if it still fails, record `UNKNOWN`. Anything else is recorded as `UNKNOWN` with "invalid verdict: <reason>". Do not fix a verdict yourself.

## 6. Write `RUN/triage.md`

1. Header: run id or folder, app commit, counts per run outcome.
2. Table: Flow | Run outcome | Rule (attempt 1) | Triager | Confidence | Failing step | Decisive next step.
3. Per flow: rationale and evidence quotes as `file:line`.
4. "Rule vs triager disagreements", listing each one.
5. "Please label": ask the human to confirm or correct each verdict. Labels go into `.claude/skills/triage-maestro-run/eval/labels.jsonl`, one line per flow: `{"buildId": "<attempt-1 build id>", "flow": "<flow>", "label": "<diagnosis>", "source": "human", "note": "..."}`.
6. If `eval/labels.jsonl` has human labels whose `buildId` appears in `eval/verdicts.jsonl`: a confusion matrix of triager vs label and rule vs label. State the number of labels; with fewer than 30 there is no accuracy claim.

Keep quotes free of recovery words, PINs and other secrets.

## 7. Record the verdicts

Append one line per triaged flow to `.claude/skills/triage-maestro-run/eval/verdicts.jsonl`:
`{"buildId": "<attempt-1 build id>", "flow": "<flow>", "outcome": "<run outcome>", "rule": "<attempt-1 diagnosis>", "triager": "<diagnosis>", "confidence": "<confidence>", "triagedAt": "<ISO date>"}`. No quotes or log text: this file is committed.

## 8. Reply

At most five lines in chat: counts per triager diagnosis, the flows a human should look at first (APP_BUG, then UNKNOWN, then TEST_BUG), and the path to `triage.md`.
