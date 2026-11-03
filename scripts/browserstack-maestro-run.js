import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import process, { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const API_ROOT = 'https://api-cloud.browserstack.com/app-automate'
const API_BASE_URL = `${API_ROOT}/maestro/v2`
const POLL_INTERVAL_MS = 10_000
// Covers BrowserStack's 15-minute queue limit plus the longest flow (~4 min) with margin.
const DEFAULT_TIMEOUT_SECONDS = 1500
const DEFAULT_MAX_ATTEMPTS = 2
const REQUEST_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 2_000
const REQUEST_TIMEOUT_MS = 60_000
const DOWNLOAD_TIMEOUT_MS = 120_000
const RATE_LIMIT_PAUSE_MS = 90_000
// No successful poll for this long means BrowserStack's API is down, not that the build is slow.
const API_OUTAGE_MS = 5 * 60_000
// FATAL means every later flow would fail the same way (e.g. the app is not installed), so the
// suite loop stops instead of burning BrowserStack minutes.
const EXIT_FATAL = 2

// Statuses after which a Maestro build no longer changes. Anything else, including statuses
// BrowserStack may add later, keeps the poll going until the attempt times out.
const TERMINAL_STATUSES = new Set(['passed', 'failed', 'error', 'timedout', 'timeout', 'done', 'stopped', 'cancelled', 'canceled', 'aborted', 'skipped'])
const FAILED_BUILD_STATUSES = new Set(['failed', 'error', 'timedout', 'timeout'])
// BrowserStack's error when it cannot start a session; on the session and on its test case.
const SESSION_NOT_STARTED = /Could not start a session/i
const SESSION_NOT_STARTED_VERDICT = Object.freeze({ diagnosis: 'INFRA', disposition: 'RETRYABLE', signal: 'BrowserStack could not start the session' })
const ARTIFACT_HOST = /^https:\/\/[\w.-]+\.browserstack\.com\//
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4B, 0x03, 0x04])
// Maestro's step and error wording, logcat and iOS web view crash markers, JSON literals, and
// BrowserStack's statuses and session error, which diagnosis, triage and the reports show as-is.
const LOG_WORDING = 'true false null tap on assert that is visible not long press input text run launch app clear state stop repeat while times wait for animation to end take screenshot scroll until swipe back hide keyboard open link element found matching regex assertion timed out failed completed running pending skipped fatal exception process anr in webcontent webkit error device session test flow command unavailable stream transport host passed timedout timeout queued done stopped cancelled canceled aborted could not start a session something went wrong during execution please try to again'
const GZIP_SIGNATURE = Buffer.from([0x1F, 0x8B])

// Taken from real failures of this suite. BrowserStack reports some device/driver losses as a
// plain `failed` test case, so the status alone cannot tell an infra failure from an assertion.
// Matched against the failing command's error when BrowserStack provides maestro_commands,
// otherwise against the failing step's part of the Maestro log.
// Patterns are anchored to Maestro's own wording, because app and Mini App text can appear in the log.
const FAILURE_SIGNATURES = [
  { pattern: /Command failed \(host:transport:[^)]*\): device '[^']+' not found/, diagnosis: 'INFRA', disposition: 'RETRYABLE', signal: 'Device dropped off ADB' },
  { pattern: /(?:StatusRuntimeException: |^)UNAVAILABLE\b/m, diagnosis: 'INFRA', disposition: 'RETRYABLE', signal: 'Maestro driver unreachable' },
]

const REPORT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f7f7f9; color: #1b1b1f; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .meta { color: #5c5c66; font-size: 13px; line-height: 1.6; margin: 0 0 12px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; text-transform: uppercase; }
  .passed { background: #e3f6e8; color: #1a7f37; }
  .failed, .error, .timedout, .timeout { background: #fde8e8; color: #b42318; }
  .running, .queued, .pending { background: #fff4d6; color: #8a6100; }
  .skipped { background: #eceef1; color: #5c5c66; }
  .counts { font-size: 13px; margin: 0 0 16px; }
  .counts span { margin-right: 14px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eceef1; font-size: 13px; vertical-align: top; }
  th { background: #fafafb; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #5c5c66; }
  tr:last-child td { border-bottom: none; }
  a { color: #0b6bcb; }
  code { background: #f2f3f5; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  footer { margin-top: 18px; font-size: 12px; color: #8a8a94; line-height: 1.6; }
`

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }

    if (!(key in env)) {
      env[key] = value
    }
  }
}

function getArgValue(args, flag, fallback = undefined) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return fallback
  }

  const next = args[index + 1]
  if (!next || next.startsWith('-')) {
    return fallback
  }

  return next
}

function getArgValues(args, flag) {
  const values = []

  for (let index = 0; index < args.length; index += 1) {
    const next = args[index + 1]
    if (args[index] === flag && next && !next.startsWith('-')) {
      values.push(next)
    }
  }

  return values
}

/** Turn repeated `--env KEY=VALUE` flags into BrowserStack's `setEnvVariables` payload. */
export function parseEnvVariables(args) {
  const variables = {}

  for (const entry of getArgValues(args, '--env')) {
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      throw new Error(`Invalid --env value "${entry}". Expected KEY=VALUE.`)
    }

    variables[entry.slice(0, separator)] = entry.slice(separator + 1)
  }

  return variables
}

function printHelp() {
  console.log(`Usage: node scripts/browserstack-maestro-run.js [options]
       node scripts/browserstack-maestro-run.js --stop-build <build_id>

Options:
  --app <value>            BrowserStack app identifier or custom_id (required)
  --suite <value>          BrowserStack test suite identifier or custom_id (required)
  --device <value>         BrowserStack device string, required, e.g. "Google Pixel 7 Pro-13.0"
  --platform <value>       Platform of the app and device: android or ios (default: android)
  --flow <value>           Flow file or folder inside the uploaded suite to execute (default: flows/francisco_tests/create_new_account_with_pageObject.yaml)
  --env <KEY=VALUE>        Environment variable exposed to the flows via BrowserStack's
                           setEnvVariables; repeat for several (e.g. APP_ID, PIN)
  --secret-env <NAME>      Like --env, with the value read from the environment variable NAME
                           (or .env): it stays off the command line and is masked in the
                           evidence files and failing step (screenshots are not kept);
                           repeat for several
  --project <value>        BrowserStack project name (default: Maestro Nimiq Pay)
  --output <value>         Report directory, or an .html file path (default: nimiq-pay-tests/tests_output/maestro_report.html)
  --evidence <dir>         Where logs/screenshots of failed attempts are saved; keep it out of
                           anything published (default: maestro-evidence/<flow name>)
  --timeout <seconds>      How long to wait for each build attempt (default: ${DEFAULT_TIMEOUT_SECONDS})
  --max-attempts <n>       Attempts per flow, including the first one (default: ${DEFAULT_MAX_ATTEMPTS})
  --deadline <epoch>       Unix time (seconds) after which no further attempt is started
  --locale <value>         Device region passed to BrowserStack, e.g. US
  --language <value>       Device language passed to BrowserStack, e.g. en
  --maestro-version <v>    Maestro version BrowserStack runs, e.g. 2.6.1
  --app-commit <sha>       Commit the uploaded app was built from, recorded in result.json
  --stop-build <id>        Stop a running build and exit
  --username <value>       BrowserStack username (or BROWSERSTACK_USERNAME env var)
  --access-key <value>     BrowserStack access key (or BROWSERSTACK_ACCESS_KEY env var)
  --help                   Show this help message
`)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  }[char]))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Replace every `setEnvVariables` value so the published build.json never carries env values. */
export function redactEnvValues(value) {
  if (Array.isArray(value)) {
    return value.map(redactEnvValues)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key !== 'setEnvVariables' || !entry) {
      return [key, redactEnvValues(entry)]
    }
    // The API may also return the variables as a JSON string.
    return [key, typeof entry === 'object' ? Object.fromEntries(Object.keys(entry).map(name => [name, '***'])) : '***']
  }))
}

/**
 * Mask secret env values (e.g. the funded testnet wallet's recovery words) in evidence. Flows
 * type recovery words one at a time, and logs, logcat and view hierarchies can show a word
 * anywhere, so every word is masked on its own, in any case. A word only counts when no ASCII
 * letter touches it (`able` stays in `capable`). Other characters don't protect it: evidence is
 * masked as latin1, where the bytes of "…" or "é" read as letters. Neither do digits, `_`, or a
 * JSON or URL escape or ANSI colour code right before it (`\nability`, `%2Fability`, `\x1B[32mability`).
 */
export function redactSecrets(text, secrets) {
  const words = secrets.flatMap(secret => secret.split(/\s+/)).filter(Boolean)
  if (words.length === 0) {
    return text
  }

  const alternatives = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const start = String.raw`(?:(?<![a-z])|(?<=\\(?:[bfnrt]|u[\da-f]{4})|%[\da-f]{2}|(?:\x1B|\\u001b)\[[\d;]*m))`
  return text.replace(new RegExp(String.raw`${start}(?:${alternatives})(?![a-z])`, 'gi'), '[redacted]')
}

/**
 * Text that evidence, steps and reports show as-is, by source: each flow and page-object file of
 * the suite, their paths (test case names) and the Maestro/log wording. Only full-line comments
 * are dropped (they never reach steps or reports); a `#` or `//` later in a line can be a value.
 */
export function readReservedWordSources(directory) {
  const files = fs.readdirSync(directory, { recursive: true })
    .filter(file => /\.(?:ya?ml|js)$/.test(file) && !/(?:^|\/)(?:tests_output|\.mutants)\//.test(file))
  return {
    'suite file names': files.join('\n'),
    ...Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8').replace(/^\s*(?:#|\/\/|\/\*|\*).*$/gm, '')])),
    'Maestro, log and BrowserStack wording': LOG_WORDING,
  }
}

/**
 * The names of the sources that share a word with the secrets. Such a word would be masked
 * wherever the source's text appears: it would corrupt evidence and show which word it is in
 * public reports. Words are ASCII letter runs, like redactSecrets' boundaries; only source
 * names are returned, so the words are never printed.
 */
export function findSecretWordSources(secrets, sources) {
  const words = new Set(secrets.flatMap(secret => secret.toLowerCase().split(/\s+/)).filter(Boolean))
  return Object.entries(sources)
    .filter(([, text]) => (text.toLowerCase().match(/[a-z]+/g) ?? []).some(word => words.has(word)))
    .map(([name]) => name)
}

/**
 * Read the `--secret-env` values. `sources` (a function, so the suite is only read when there are
 * secrets) are checked with findSecretWordSources; a non-empty `reservedSources` means the run
 * must not start.
 */
export function prepareSecrets(names, environment, sources) {
  const variables = {}
  for (const name of names) {
    if (!environment[name]) {
      throw new Error(`--secret-env ${name}: the environment variable is not set.`)
    }
    variables[name] = environment[name]
  }

  const secrets = Object.values(variables)
  return { variables, secrets, reservedSources: secrets.length > 0 ? findSecretWordSources(secrets, sources()) : [] }
}

/** Mask secrets in every string value, never in keys, which are fixed text the reports rely on. */
export function redactSecretValues(value, secrets) {
  if (typeof value === 'string') {
    return redactSecrets(value, secrets)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Array.isArray(value)
    ? value.map(entry => redactSecretValues(entry, secrets))
    : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactSecretValues(entry, secrets)]))
}

/**
 * Flatten the per-device session responses into one row per test case, plus the counters
 * BrowserStack reports per build. `ok` drives the process exit code, so it only holds for a
 * finished, passed build: after a poll error the last known build can still be `running` with
 * every reported row passed so far.
 */
export function summarizeResults(build, sessions) {
  const rows = []

  for (const session of sessions ?? []) {
    for (const group of session.testcases?.data ?? []) {
      for (const testcase of group.testcases ?? []) {
        rows.push({
          device: session.device,
          name: testcase.name,
          status: testcase.status,
          duration: testcase.duration,
          video: testcase.video,
          deviceLog: testcase.device_log,
          maestroLog: testcase.maestro_log,
          screenshots: testcase.screenshots,
          crashLogsCount: testcase.crash_logs_count,
        })
      }
    }
  }

  const counts = { passed: 0, failed: 0, skipped: 0, error: 0, timedout: 0 }
  for (const row of rows) {
    const status = String(row.status ?? '').toLowerCase().replace(/^timeout$/, 'timedout')
    if (status in counts) {
      counts[status] += 1
    }
  }

  const crashLogs = rows.reduce((total, row) => total + (Number(row.crashLogsCount) || 0), 0)
  const buildStatus = String(build?.status ?? '').toLowerCase()
  // `done` is a finished status in BrowserStack's build list; its rows decide like for `passed`.
  const ok = ['passed', 'done'].includes(buildStatus)
    && counts.passed > 0
    && rows.every(row => ['passed', 'skipped'].includes(String(row.status ?? '').toLowerCase()))
  // The session can fail to start before any test case runs: the error is on the session and
  // its test cases stay queued (the only status seen), so none of them reaches diagnoseTestcase.
  const neverStarted = (sessions ?? []).some((session) => {
    const statuses = (session.testcases?.data ?? []).flatMap(group => group.testcases ?? []).map(testcase => String(testcase.status ?? '').toLowerCase())
    return SESSION_NOT_STARTED.test(session?.error?.message ?? '') && statuses.length > 0 && statuses.every(status => status === 'queued')
  })

  return { rows, counts, buildStatus, ok, crashLogs, neverStarted }
}

/** The Maestro command that failed, from BrowserStack's maestro_commands (an array of {command, metadata}). */
function findFailedCommand(commands) {
  if (!Array.isArray(commands)) {
    return undefined
  }

  const failed = commands.find(entry => entry?.metadata?.status === 'FAILED')
  if (!failed) {
    return undefined
  }

  const error = failed.metadata.error ?? {}
  return {
    name: Object.keys(failed.command ?? {})[0],
    message: [error.message, error.cause?.message].filter(Boolean).join('\n'),
  }
}

const FAILED_STEP = /TestSuiteInteractor\.invoke: (.+) FAILED\s*$/

/** The last step Maestro logged as FAILED, e.g. `Assert that "Settings" is visible`. */
export function findFailingStep(maestroLog) {
  const matches = [...String(maestroLog ?? '').matchAll(new RegExp(FAILED_STEP.source, 'gm'))]
  return matches.at(-1)?.[1]
}

/**
 * The part of the Maestro log that explains the failure: the failing step from its RUNNING to
 * its FAILED line, or the "Failed to complete flow" block when no step ran. Scanning the whole
 * log would let a recovered driver hiccup earlier in the run turn an assertion failure into INFRA.
 */
export function failureContext(maestroLog) {
  const lines = String(maestroLog ?? '').split(/\r?\n/)
  const failedIndex = lines.findLastIndex(line => FAILED_STEP.test(line))
  if (failedIndex >= 0) {
    const step = lines[failedIndex].match(FAILED_STEP)[1]
    const runningIndex = lines.slice(0, failedIndex).findLastIndex(line => line.trimEnd().endsWith(`TestSuiteInteractor.invoke: ${step} RUNNING`))
    return withoutElementDumps(lines.slice(runningIndex >= 0 ? runningIndex : failedIndex, failedIndex + 1))
  }

  const flowFailedIndex = lines.findIndex(line => line.includes('Failed to complete flow'))
  return flowFailedIndex >= 0 ? withoutElementDumps(lines.slice(flowFailedIndex)) : ''
}

// Maestro logs the tapped element's attributes (`UiElement(treeNode=TreeNode(attributes={text=...`),
// i.e. text the app or a Mini App controls; it must never count as a failure signature.
function withoutElementDumps(lines) {
  return lines.filter(line => !/UiElement\(|TreeNode\(/.test(line)).join('\n')
}

/**
 * A crash or ANR of the app under test in BrowserStack's logcat (`MM-DD HH:MM:SS.mmm L/Tag(PID): msg`),
 * or on iOS a crash of the app's web view content process. Matched on the log tag, not the message,
 * so console output (which Mini Apps control) cannot fake it. BrowserStack's crash_logs_count can be
 * 0 while the device log shows the crash.
 */
export function findAppCrash(deviceLog, packages) {
  const lines = String(deviceLog ?? '').split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    // WebKit, logging from the app's own process (`App` is Capacitor's executable name). The app
    // process survives and WebKit reloads the page, so a flow sees the locked app instead (run 39940894400).
    if (/^\w{3} +\d+ [\d:]+ App\(WebKit\)\[\d+\] <Error>: .*WebPageProxy::dispatchProcessDidTerminate: reason=Crash\b/.test(line)) {
      return 'WebContent process (WebKit)'
    }
    if (/^\S+ \S+ [EF]\/AndroidRuntime\(\s*\d+\): FATAL EXCEPTION/.test(line)) {
      const crashed = lines.slice(index + 1, index + 4).join('\n').match(/[EF]\/AndroidRuntime\(\s*\d+\): Process: ([\w.]+)/)?.[1]
      if (packages.includes(crashed)) {
        return `FATAL EXCEPTION in ${crashed}`
      }
    }
    const notResponding = line.match(/^\S+ \S+ [EWI]\/ActivityManager\(\s*\d+\): ANR in ([\w.]+)/)?.[1]
    if (packages.includes(notResponding)) {
      return `ANR in ${notResponding}`
    }
  }
  return undefined
}

/**
 * Deterministic diagnosis of one test case that did not pass. Only signatures seen in real
 * runs are classified; everything else stays UNKNOWN and gets a diagnostic rerun, because
 * guessing INFRA for an app or test bug would retry it into a false green.
 */
export function diagnoseTestcase({ session, testcase, maestroLog = '', commands, deviceLog = '', appId, bundleId }) {
  // BrowserStack returns the count as a string.
  if (Number(testcase?.crash_logs_count) > 0) {
    return { diagnosis: 'APP_BUG', disposition: 'NO_RETRY', signal: `App crash logs captured (${testcase.crash_logs_count})` }
  }

  // Before the infra signatures: a crashing app can take the Maestro driver down with it.
  const crash = findAppCrash(deviceLog, [appId, bundleId].filter(Boolean))
  if (crash) {
    return { diagnosis: 'APP_BUG', disposition: 'NO_RETRY', signal: `App crashed: ${crash}` }
  }

  // BrowserStack documents `error` as its own infrastructure failing; with no flow started, the
  // app never ran. Session-level errors carry the same "Could not start a session" message.
  const neverStarted = String(testcase?.status ?? '').toLowerCase() === 'error' || SESSION_NOT_STARTED.test(session?.error?.message ?? '')
  if (neverStarted && Number(testcase?.metadata?.total_flows) === 0) {
    return SESSION_NOT_STARTED_VERDICT
  }

  const failedCommand = findFailedCommand(commands)
  const evidence = failedCommand ? failedCommand.message : failureContext(maestroLog)

  const missingPackage = evidence.match(/Unable to launch app \S+: Package (\S+) is not installed/)?.[1]
  if (missingPackage) {
    if (missingPackage === bundleId) {
      return { diagnosis: 'HARNESS', disposition: 'RETRYABLE', signal: `The uploaded app ${bundleId} is not installed on the device` }
    }
    // Every flow launching ${APP_ID} fails the same way, so stop the suite.
    if (missingPackage === appId) {
      return { diagnosis: 'HARNESS', disposition: 'FATAL', signal: `APP_ID ${appId} does not match the uploaded app (${bundleId ?? 'unknown'})` }
    }
    return { diagnosis: 'TEST_BUG', disposition: 'NO_RETRY', signal: `Flow launches ${missingPackage}, but the uploaded app is ${bundleId ?? 'unknown'}` }
  }

  const match = FAILURE_SIGNATURES.find(({ pattern }) => pattern.test(evidence))
  if (match) {
    return { diagnosis: match.diagnosis, disposition: match.disposition, signal: match.signal }
  }

  return { diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC', signal: '' }
}

// Most severe first: a crash or a broken setup must never hide behind a retryable sibling.
const DISPOSITION_SEVERITY = ['FATAL', 'NO_RETRY', 'DIAGNOSTIC', 'RETRYABLE']

/**
 * Combine the per-test-case diagnoses of one build attempt into a single verdict. What the test
 * cases recorded always wins: a failure must never be explained away by an API problem that
 * happened after it, or a passing retry would turn it green.
 */
export function diagnoseAttempt(summary, diagnoses = [], { waitError, sessionsError } = {}) {
  if (summary.ok) {
    return { diagnosis: 'PASSED', disposition: 'NONE', signal: summary.crashLogs > 0 ? `Passed, but app crash logs were captured (${summary.crashLogs})` : '' }
  }

  const fromTestcases = DISPOSITION_SEVERITY
    .map(disposition => diagnoses.find(entry => entry.disposition === disposition))
    .find(Boolean)
  // Every later flow would wait out the same outage, so stop the suite. Only a crash or another
  // fatal finding outranks it: a build stopped after the outage can read like an infra failure.
  if (waitError?.apiUnreachable && !['FATAL', 'NO_RETRY'].includes(fromTestcases?.disposition)) {
    return { diagnosis: 'HARNESS', disposition: 'FATAL', signal: 'BrowserStack API unreachable while polling the build' }
  }

  if (fromTestcases) {
    return fromTestcases
  }

  if (summary.neverStarted) {
    return SESSION_NOT_STARTED_VERDICT
  }

  if (waitError?.timedOut) {
    return { diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC', signal: 'Build did not finish in time and was stopped' }
  }

  // Only when nothing says the build itself failed: then the API problem is all we know.
  if ((waitError || sessionsError) && !FAILED_BUILD_STATUSES.has(summary.buildStatus)) {
    // A 401 here repeats on the retry's build POST, where it is classified FATAL.
    return { diagnosis: 'HARNESS', disposition: 'RETRYABLE', signal: 'BrowserStack API failed while reading the build' }
  }

  // A finished, passed build without test cases ran nothing: the flow path does not match the
  // suite. Retrying cannot fix that, but the other flows are unaffected.
  if (summary.rows.length === 0 && summary.buildStatus === 'passed' && !sessionsError) {
    return { diagnosis: 'HARNESS', disposition: 'NO_RETRY', signal: 'No test cases reported; the flow path probably does not exist in the uploaded suite' }
  }

  return { diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC', signal: `Build finished with status "${summary.buildStatus}"` }
}

/** Whether another attempt is worth starting for this flow. */
export function shouldRetry(attempt, { attemptNumber, maxAttempts, secondsLeft = Infinity, timeoutSeconds }) {
  return attemptNumber < maxAttempts
    && ['RETRYABLE', 'DIAGNOSTIC'].includes(attempt.disposition)
    && secondsLeft > timeoutSeconds
}

/**
 * Final outcome of a flow across its attempts. A diagnostic rerun is evidence, never a pass:
 * passing on it means INTERMITTENT (possibly a real intermittent app bug), not green.
 */
export function resolveOutcome(attempts) {
  const first = attempts[0]
  const last = attempts.at(-1)

  if (first.diagnosis === 'PASSED') {
    return { outcome: 'PASSED', ok: true }
  }

  if (attempts.length === 1) {
    return { outcome: first.diagnosis, ok: false }
  }

  const previous = attempts.slice(0, -1)
  const onlyInfraRetries = previous.every(attempt => attempt.disposition === 'RETRYABLE')

  if (last.diagnosis === 'PASSED') {
    return onlyInfraRetries ? { outcome: 'PASSED_ON_RETRY', ok: true } : { outcome: 'INTERMITTENT', ok: false }
  }

  // A rerun that finds a cause (crash, wrong app, missing flow) explains the first failure too;
  // an infra or API hiccup on the rerun does not.
  if (onlyInfraRetries || ['NO_RETRY', 'FATAL'].includes(last.disposition)) {
    return { outcome: last.diagnosis, ok: false }
  }

  const before = attempts.at(-2)
  if (last.diagnosis === 'UNKNOWN' && before.failingStep && before.failingStep === last.failingStep) {
    return { outcome: 'DETERMINISTIC', ok: false }
  }

  return { outcome: 'UNKNOWN', ok: false }
}

/**
 * HTML report of one build. With `result` (the flow's outcome across attempts) the page leads
 * with that outcome: after a diagnostic rerun the last build can be green while the flow is not.
 */
export function renderReport(build, sessions, result = undefined) {
  const { rows, counts, buildStatus, ok } = summarizeResults(build, sessions)
  const outcomeBanner = result
    ? `<p class="meta"><span class="badge ${result.ok ? 'passed' : 'failed'}">outcome: ${escapeHtml(result.outcome)}</span>
    after ${result.attempts.length} attempt(s) · this page shows the last one · ${result.attempts.map((_, index) => `<a href="attempt-${index + 1}/index.html">attempt ${index + 1}</a>`).join(' · ')}</p>`
    : ''

  const startedAt = build?.start_time ?? '—'
  const duration = build?.duration === null || build?.duration === undefined ? '—' : `${build.duration}s`
  const devices = (build?.input_capabilities?.devices ?? []).join(', ') || '—'
  const app = build?.app_details?.name ?? build?.input_capabilities?.app ?? '—'
  const suite = build?.test_suite_details?.name ?? build?.input_capabilities?.testSuite ?? '—'
  const buildId = build?.id ?? '—'
  const dashboardUrl = `https://app-automate.browserstack.com/dashboard/v2/builds/${buildId}`

  const tableRows = rows.map((row) => {
    const status = String(row.status ?? 'unknown').toLowerCase()
    const artifacts = [
      row.video && `<a href="${escapeHtml(row.video)}">video</a>`,
      row.deviceLog && `<a href="${escapeHtml(row.deviceLog)}">device log</a>`,
      row.maestroLog && `<a href="${escapeHtml(row.maestroLog)}">maestro log</a>`,
      row.screenshots && `<a href="${escapeHtml(row.screenshots)}">screenshots</a>`,
    ].filter(Boolean).join(' · ')

    const rowDuration = row.duration === null || row.duration === undefined ? '—' : `${escapeHtml(row.duration)}s`

    return `<tr>
      <td>${escapeHtml(row.device ?? '—')}</td>
      <td><code>${escapeHtml(row.name ?? '—')}</code></td>
      <td><span class="badge ${escapeHtml(status)}">${escapeHtml(row.status ?? 'unknown')}</span></td>
      <td>${rowDuration}</td>
      <td>${artifacts || '—'}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maestro report — ${escapeHtml(result?.outcome ?? (buildStatus || 'unknown'))}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <h1>Maestro test report</h1>
  ${outcomeBanner}
  <p class="meta">
    <span class="badge ${escapeHtml(buildStatus || 'unknown')}">${escapeHtml(buildStatus || 'unknown')}</span>
    ${escapeHtml(startedAt)} · ${escapeHtml(duration)} · build <code>${escapeHtml(buildId)}</code>${ok ? '' : ' · see the BrowserStack build for details'}
  </p>
  <p class="meta">
    Device(s): ${escapeHtml(devices)}<br>
    App: ${escapeHtml(app)}<br>
    Test suite: ${escapeHtml(suite)}<br>
    Project: ${escapeHtml(build?.input_capabilities?.project ?? '—')}
  </p>
  <p class="counts">
    <span>✅ passed: <strong>${counts.passed}</strong></span>
    <span>❌ failed: <strong>${counts.failed}</strong></span>
    <span>💥 error: <strong>${counts.error}</strong></span>
    <span>⏱️ timed out: <strong>${counts.timedout}</strong></span>
    <span>⏭️ skipped: <strong>${counts.skipped}</strong></span>
  </p>
  <table>
    <thead>
      <tr><th>Device</th><th>Test</th><th>Status</th><th>Duration</th><th>Artifacts</th></tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="5">No test cases were reported for this build.</td></tr>'}</tbody>
  </table>
  <footer>
    Generated by scripts/browserstack-maestro-run.js ·
    <a href="${escapeHtml(dashboardUrl)}">Open build ${escapeHtml(buildId)} on the BrowserStack dashboard</a><br>
    Artifact links point at the BrowserStack API and require an authenticated session to open.
  </footer>
</body>
</html>
`
}

function createApiClient(username, accessKey) {
  const authorization = `Basic ${Buffer.from(`${username}:${accessKey}`).toString('base64')}`

  // GETs are retried on network errors, 429 and 5xx: a single dropped poll used to fail the
  // whole flow. Other methods are not, since a retried build POST could start a second build.
  async function request(endpoint, init = {}) {
    const method = init.method ?? 'GET'
    const url = endpoint.startsWith('https://') ? endpoint : `${API_BASE_URL}${endpoint}`
    const attempts = method === 'GET' ? REQUEST_ATTEMPTS : 1

    for (let attempt = 1; ; attempt += 1) {
      let response
      try {
        response = await fetch(url, {
          ...init,
          headers: { Authorization: authorization, ...(init.headers ?? {}) },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      }
      catch (error) {
        if (attempt >= attempts) {
          throw Object.assign(new Error(`${method} ${endpoint} failed: ${error.message}`), { transient: true })
        }
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
        continue
      }

      const body = await response.text()
      if (response.ok) {
        try {
          return JSON.parse(body)
        }
        catch {
          // Seen as an HTML error page with status 200 during BrowserStack incidents.
          if (attempt >= attempts) {
            throw Object.assign(new Error(`${method} ${endpoint} returned a non-JSON body`), { transient: true })
          }
          await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
          continue
        }
      }

      const transient = response.status === 429 || response.status >= 500
      if (!transient || attempt >= attempts) {
        throw Object.assign(new Error(`${method} ${endpoint} failed with ${response.status}: ${body.slice(0, 300)}`), { status: response.status, transient })
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
  }

  async function download(url) {
    if (!ARTIFACT_HOST.test(url)) {
      return { status: 0, contentType: '', buffer: Buffer.alloc(0) }
    }
    // Session responses link artifacts on api.browserstack.com; the same paths answer on
    // api-cloud, which is the host these credentials are known to work against.
    const response = await fetch(url.replace('://api.browserstack.com/', '://api-cloud.browserstack.com/'), {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      buffer: Buffer.from(await response.arrayBuffer()),
    }
  }

  return { request, download }
}

async function stopBuild(request, buildId) {
  try {
    const result = await request(`${API_ROOT}/maestro/builds/${buildId}/stop`, { method: 'POST' })
    console.log(`🛑 Stop requested for build ${buildId}: ${JSON.stringify(result)}`)
  }
  catch (error) {
    console.error(`::warning::Could not stop BrowserStack build ${buildId}; it may keep a parallel busy: ${error.message}`)
  }
}

/** BrowserStack's build list reports start times as "2026-09-24 18:05:08 UTC". */
export function parseBrowserStackTime(value) {
  return Date.parse(String(value ?? '').replace(' UTC', 'Z').replace(' ', 'T'))
}

/**
 * When a build POST fails on the network or with a 5xx, BrowserStack may still have created the
 * build. Stop a still-running build of the same flow on the same device that started meanwhile, so
 * the retry does not run next to an orphan holding a parallel. Builds of the same flow from earlier
 * attempts are already finished or stopped, so they are skipped. The device check spares the other
 * platform's CI job, which runs the same flows at the same time.
 */
export async function stopOrphanedBuild(request, { execute, devices }, postedAt) {
  try {
    const recent = await request('/builds?limit=10')
    for (const { id, start_time: startTime } of Array.isArray(recent) ? recent : (recent?.builds ?? [])) {
      // One minute of slack for clock skew between this machine and BrowserStack. A build still
      // queued may have no start time yet, so only a known, older start time rules it out.
      const started = parseBrowserStackTime(startTime)
      if (Number.isFinite(started) && started < postedAt - 60_000) {
        continue
      }
      const build = await request(`/builds/${id}`)
      const sameFlow = JSON.stringify(build.input_capabilities?.execute) === JSON.stringify(execute)
        && JSON.stringify(build.input_capabilities?.devices) === JSON.stringify(devices)
      if (sameFlow && !TERMINAL_STATUSES.has(String(build.status).toLowerCase())) {
        console.error(`⚠️ Found build ${id} started by the failed request; stopping it`)
        await stopBuild(request, id)
      }
    }
  }
  catch (error) {
    console.error(`::warning::Could not check for a build orphaned by the failed request: ${error.message}`)
  }
}

async function waitForBuild(request, buildId, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  let lastStatus
  let lastSuccessAt = Date.now()

  for (;;) {
    try {
      const build = await request(`/builds/${buildId}`)
      lastSuccessAt = Date.now()
      if (build.status !== lastStatus) {
        lastStatus = build.status
        console.log(`   status: ${lastStatus}`)
      }
      if (TERMINAL_STATUSES.has(String(build.status).toLowerCase())) {
        return build
      }
    }
    catch (error) {
      // Polls are idempotent: ride out an API outage instead of stopping a healthy build.
      if (!error.transient) {
        throw error
      }
      console.error(`⚠️ ${error.message}; still polling`)
    }

    if (Date.now() > deadline) {
      throw Object.assign(new Error(`Timed out after ${timeoutSeconds}s waiting for build ${buildId} (last status: ${lastStatus ?? 'unknown'}).`), {
        timedOut: true,
        apiUnreachable: Date.now() - lastSuccessAt > API_OUTAGE_MS,
      })
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

async function collectSessions(request, buildId, build) {
  const sessions = []

  for (const device of build.devices ?? []) {
    for (const session of device.sessions ?? []) {
      const details = await request(`/builds/${buildId}/sessions/${session.id}`)
      sessions.push({ ...details, device: details.device ?? device.device })
    }
  }

  return sessions
}

function extensionFor(contentType) {
  if (/json/i.test(contentType)) {
    return 'json'
  }
  if (/text\/plain/i.test(contentType)) {
    return 'txt'
  }
  return 'bin'
}

/**
 * Download every artifact a failed test case links (video excepted: too large for evidence,
 * and the dashboard keeps it) and diagnose it from the Maestro log and command results.
 * The diagnosis reads the unmasked text; secrets are masked only in what is written or returned.
 */
export async function collectEvidence(download, { session, testcase, appId, bundleId, secrets = [] }, directory) {
  fs.mkdirSync(directory, { recursive: true })
  const files = {}
  let maestroLog = ''
  let deviceLog = ''
  let commands

  const artifacts = Object.entries(testcase)
    .filter(([key, url]) => key !== 'video' && typeof url === 'string' && url.startsWith('https://'))

  await Promise.all(artifacts.map(async ([key, url]) => {
    // Images can't be masked, and the Login screen shows the typed words. The evidence artifact
    // is public (any signed-in GitHub user can download a public repo's artifacts).
    if (key === 'screenshots' && secrets.length > 0) {
      files[key] = 'withheld: the flow ran with a secret, which screenshots can show'
      return
    }
    try {
      const { status, contentType, buffer } = await download(url)
      if (status !== 200) {
        files[key] = `HTTP ${status}`
        return
      }

      // Told apart by content, not content type. A gzipped log is unpacked, or its secrets stay.
      const data = buffer.subarray(0, 2).equals(GZIP_SIGNATURE) ? zlib.gunzipSync(buffer) : buffer
      const isZip = data.subarray(0, 4).equals(ZIP_SIGNATURE)
      if (isZip && key !== 'screenshots') {
        files[key] = 'withheld: only the screenshots zip is kept unmasked'
        return
      }
      const fileName = `${key}.${isZip ? 'zip' : extensionFor(contentType)}`
      // Zips (screenshots) cannot be masked and are kept as they are. Anything else is masked as
      // latin1 text, which leaves every byte except the masked words as it was.
      const text = data.toString('latin1')
      const masked = isZip ? text : redactSecrets(text, secrets)
      fs.writeFileSync(path.join(directory, fileName), masked === text ? data : Buffer.from(masked, 'latin1'))
      files[key] = fileName

      if (key === 'maestro_log') {
        maestroLog = data.toString('utf8')
      }
      if (key === 'device_log') {
        deviceLog = data.toString('utf8')
      }
      if (key === 'maestro_commands') {
        try {
          commands = JSON.parse(data.toString('utf8'))
        }
        catch (error) {
          files[key] = `${fileName} (not valid JSON: ${error.message})`
        }
      }
    }
    catch (error) {
      files[key] = `download failed: ${error.message}`
    }
  }))

  const diagnosis = diagnoseTestcase({ session, testcase, maestroLog, commands, deviceLog, appId, bundleId })
  const step = findFailingStep(maestroLog) ?? findFailedCommand(commands)?.name
  // Published in the reports and Slack.
  const failingStep = step && redactSecrets(step, secrets)
  fs.writeFileSync(path.join(directory, 'evidence.json'), redactSecrets(JSON.stringify({
    testcase: testcase.name,
    status: testcase.status,
    metadata: testcase.metadata,
    crashLogsCount: testcase.crash_logs_count,
    session: { id: session.id, status: session.status, reason: session.reason, error: session.error },
    ...diagnosis,
    failingStep,
    files,
  }, null, 2), secrets))

  return { ...diagnosis, failingStep }
}

async function runAttempt(client, payload, { platform, timeoutSeconds, evidenceDirectory, secrets = [] }) {
  let started
  const postedAt = Date.now()
  try {
    started = await client.request(`/${platform}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  catch (error) {
    // The error body may echo the payload, and a cut-off echo escapes GitHub's secret masking.
    console.error(`❌ ${redactSecrets(error.message, secrets)}`)
    // 429 is BrowserStack's parallel/rate limit: worth another attempt after a pause, unlike other 4xx.
    const fatal = error.status >= 400 && error.status < 500 && error.status !== 429
    if (error.status === 429) {
      await sleep(RATE_LIMIT_PAUSE_MS)
    }
    else if (!fatal) {
      await stopOrphanedBuild(client.request, payload, postedAt)
    }
    return {
      build: null,
      sessions: [],
      diagnosis: 'HARNESS',
      disposition: fatal ? 'FATAL' : 'RETRYABLE',
      signal: fatal ? `BrowserStack rejected the build (${error.status}); check app/suite ids, device and payload` : 'Could not start the build on BrowserStack',
    }
  }

  const buildId = started?.build_id
  if (!buildId) {
    console.error(`❌ BrowserStack did not return a build id: ${redactSecrets(JSON.stringify(started), secrets).slice(0, 200)}`)
    return { build: null, sessions: [], diagnosis: 'HARNESS', disposition: 'RETRYABLE', signal: 'BrowserStack did not return a build id' }
  }

  console.log(`✅ Build started: ${buildId}`)
  console.log(`⏳ Waiting for the build to finish (timeout ${timeoutSeconds}s)...`)

  // Lets the workflow's cancellation step stop builds a cancelled job leaves running.
  const activeBuildFile = path.join(evidenceDirectory, 'active-build.txt')
  fs.mkdirSync(evidenceDirectory, { recursive: true })
  fs.writeFileSync(activeBuildFile, buildId)

  let build
  let waitError
  try {
    build = await waitForBuild(client.request, buildId, timeoutSeconds)
  }
  catch (error) {
    waitError = error
    console.error(`❌ ${error.message}`)
    // Also after API errors: a retry must not run next to an orphaned build holding a parallel.
    await stopBuild(client.request, buildId)
    build = await client.request(`/builds/${buildId}`).catch(() => null)
  }
  fs.rmSync(activeBuildFile, { force: true })

  build ??= { id: buildId, status: 'unknown' }
  let sessionsError
  const sessions = await collectSessions(client.request, buildId, build).catch((error) => {
    console.error(`⚠️ Could not read every session: ${error.message}`)
    sessionsError = error
    return []
  })
  const summary = summarizeResults(build, sessions)

  const diagnoses = []
  for (const session of sessions) {
    for (const group of session.testcases?.data ?? []) {
      for (const testcase of group.testcases ?? []) {
        // Only finished failures carry evidence. Cases still running/queued in a stopped build
        // would otherwise hide the timeout or API-outage verdict behind an empty UNKNOWN.
        if (!FAILED_BUILD_STATUSES.has(String(testcase.status ?? '').toLowerCase())) {
          continue
        }
        const name = path.basename(String(testcase.name ?? testcase.id ?? 'testcase'))
        diagnoses.push(await collectEvidence(client.download, {
          session,
          testcase,
          appId: payload.setEnvVariables?.APP_ID,
          bundleId: build.app_details?.bundle_id,
          secrets,
        }, path.join(evidenceDirectory, name)))
      }
    }
  }

  const verdict = diagnoseAttempt(summary, diagnoses, { waitError, sessionsError })
  return { build, sessions, summary, ...verdict, failingStep: diagnoses.find(entry => entry.failingStep)?.failingStep }
}

function resolveReportPaths(output) {
  // The report is a directory (index.html + build.json) so it can be published as-is, but an
  // explicit .html path is honoured for callers that only want the page.
  const htmlPath = /\.html?$/i.test(output) ? output : path.join(output, 'index.html')
  const directory = path.dirname(htmlPath)
  fs.mkdirSync(directory, { recursive: true })
  return { directory, htmlName: path.basename(htmlPath) }
}

/**
 * Write the attempt's report page and build.json, both published (e.g. on the public Netlify
 * site). Only BrowserStack's values are masked: the page template and the JSON keys are fixed
 * text, and masking a word there would corrupt the files and show which word it is.
 */
export function writeAttemptReport(directory, attempt, { htmlName = 'index.html', result, secrets = [] } = {}) {
  fs.mkdirSync(directory, { recursive: true })
  const { build, sessions } = redactSecretValues(redactEnvValues({ build: attempt.build ?? { status: 'not started' }, sessions: attempt.sessions }), secrets)
  fs.writeFileSync(path.join(directory, htmlName), renderReport(build, sessions, result))
  fs.writeFileSync(path.join(directory, 'build.json'), JSON.stringify({ build, sessions }, null, 2))
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    printHelp()
    return
  }

  loadDotEnv(path.resolve(process.cwd(), '.env'))

  const username = getArgValue(args, '--username', env.BROWSERSTACK_USERNAME)
  const accessKey = getArgValue(args, '--access-key', env.BROWSERSTACK_ACCESS_KEY)

  if (!username || !accessKey) {
    throw new Error('BrowserStack credentials not found. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY or pass --username/--access-key.')
  }

  const client = createApiClient(username, accessKey)

  const buildToStop = getArgValue(args, '--stop-build')
  if (buildToStop) {
    await stopBuild(client.request, buildToStop)
    return
  }

  const app = getArgValue(args, '--app', env.BROWSERSTACK_APP_ID)
  const suite = getArgValue(args, '--suite', env.BROWSERSTACK_TEST_SUITE_ID)
  const device = getArgValue(args, '--device', env.BROWSERSTACK_DEVICE)
  const flow = getArgValue(args, '--flow', 'flows/francisco_tests/create_new_account_with_pageObject.yaml')
  const project = getArgValue(args, '--project', 'Maestro Nimiq Pay')
  const output = getArgValue(args, '--output', 'nimiq-pay-tests/tests_output/maestro_report.html')
  const flowName = path.basename(flow, path.extname(flow))
  const evidenceDirectory = getArgValue(args, '--evidence', path.join('maestro-evidence', flowName))
  const timeoutSeconds = Number(getArgValue(args, '--timeout', String(DEFAULT_TIMEOUT_SECONDS)))
  const maxAttempts = Number(getArgValue(args, '--max-attempts', String(DEFAULT_MAX_ATTEMPTS)))
  const deadline = Number(getArgValue(args, '--deadline', 'Infinity'))
  const platform = getArgValue(args, '--platform', 'android')

  if (!['android', 'ios'].includes(platform)) {
    throw new Error('--platform must be android or ios.')
  }

  if (!app) {
    throw new Error('Missing app identifier. Pass --app or set BROWSERSTACK_APP_ID.')
  }

  if (!suite) {
    throw new Error('Missing test suite identifier. Pass --suite or set BROWSERSTACK_TEST_SUITE_ID.')
  }

  if (!device) {
    throw new Error('Missing BrowserStack device. Pass --device "Google Pixel 7 Pro-13.0" or set BROWSERSTACK_DEVICE.')
  }

  if (!device.includes('-')) {
    throw new Error('BrowserStack device must include OS version in the format "Google Pixel 7 Pro-13.0".')
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('--timeout must be a positive number of seconds.')
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('--max-attempts must be a positive integer.')
  }

  const envVariables = parseEnvVariables(args)
  const { variables: secretVariables, secrets, reservedSources } = prepareSecrets(getArgValues(args, '--secret-env'), env, () => ({
    ...readReservedWordSources(fileURLToPath(new URL('../nimiq-pay-tests/', import.meta.url))),
    'run options': [app, suite, device, flow, project].join('\n'),
  }))
  Object.assign(envVariables, secretVariables)
  if (reservedSources.length > 0) {
    // A result keeps quarantine and the reports working. Its signal is published, so the
    // sources are only named in the job log (the repo's members only).
    const signal = 'Not run: a --secret-env value shares words with the suite or log wording (sources in the job log)'
    const { directory } = resolveReportPaths(output)
    fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ flow, outcome: 'NOT_RUN', ok: false, signal, attempts: [] }, null, 2))
    console.error(`::error::${signal}. Masking a shared word would corrupt the evidence and reveal it in public reports. Sources: ${reservedSources.join(', ')}. Reword the source, or use a wallet without such words.`)
    process.exitCode = 1
    return
  }
  const payload = {
    app,
    testSuite: suite,
    project,
    devices: [device],
    execute: [flow],
    deviceLogs: true,
  }

  for (const [flag, key] of [['--locale', 'locale'], ['--language', 'language'], ['--maestro-version', 'maestroVersion']]) {
    const value = getArgValue(args, flag)
    if (value) {
      payload[key] = value
    }
  }

  if (Object.keys(envVariables).length > 0) {
    payload.setEnvVariables = envVariables
  }

  console.log('🚀 Starting BrowserStack Maestro build...')
  console.log(`📄 Maestro report output: ${output}`)
  console.log(`🔎 Evidence of failed attempts: ${evidenceDirectory}`)
  console.log(JSON.stringify(redactEnvValues(payload), null, 2))

  const { directory, htmlName } = resolveReportPaths(output)
  const attempts = []

  for (let attemptNumber = 1; ; attemptNumber += 1) {
    if (attemptNumber > 1) {
      const previous = attempts.at(-1)
      console.log(`🔁 Attempt ${attemptNumber}: ${previous.disposition === 'DIAGNOSTIC' ? 'diagnostic rerun (its result is evidence, never a pass)' : `retrying ${previous.diagnosis}`}`)
    }

    const attempt = await runAttempt(client, payload, {
      platform,
      timeoutSeconds,
      evidenceDirectory: path.join(evidenceDirectory, `attempt-${attemptNumber}`),
      secrets,
    })
    attempts.push(attempt)
    writeAttemptReport(path.join(directory, `attempt-${attemptNumber}`), attempt, { secrets })
    console.log(`🩺 Attempt ${attemptNumber}: ${attempt.diagnosis}${attempt.signal ? ` — ${attempt.signal}` : ''}${attempt.failingStep ? ` (step: ${attempt.failingStep})` : ''}`)

    const secondsLeft = deadline - Date.now() / 1000
    if (!shouldRetry(attempt, { attemptNumber, maxAttempts, secondsLeft, timeoutSeconds })) {
      break
    }
  }

  const result = {
    flow,
    platform,
    ...resolveOutcome(attempts),
    appCommit: getArgValue(args, '--app-commit') ?? null,
    attempts: attempts.map(attempt => ({
      buildId: attempt.build?.id ?? null,
      buildStatus: attempt.summary?.buildStatus ?? 'not started',
      counts: attempt.summary?.counts ?? null,
      diagnosis: attempt.diagnosis,
      disposition: attempt.disposition,
      signal: attempt.signal,
      failingStep: attempt.failingStep ?? null,
    })),
  }
  const { outcome, ok } = result
  // The flow's top-level report is the last attempt under the flow's outcome; the aggregate links to it.
  writeAttemptReport(directory, attempts.at(-1), { htmlName, result, secrets })
  fs.writeFileSync(path.join(directory, 'result.json'), redactSecrets(JSON.stringify(result, null, 2), secrets))

  console.log(`📊 Outcome: ${outcome} after ${attempts.length} attempt(s)`)
  console.log(`📝 Report written to ${path.join(directory, htmlName)}`)

  if (attempts.some(attempt => attempt.disposition === 'FATAL')) {
    console.error('❌ Fatal harness problem: later flows would fail the same way.')
    process.exitCode = EXIT_FATAL
    return
  }

  if (!ok) {
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}
