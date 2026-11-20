import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  collectEvidence,
  diagnoseAttempt,
  diagnoseTestcase,
  failureContext,
  findAppCrash,
  findFailingStep,
  findSecretWordSources,
  parseBrowserStackTime,
  parseEnvVariables,
  prepareSecrets,
  readReservedWordSources,
  redactEnvValues,
  redactSecrets,
  renderReport,
  resolveOutcome,
  shouldRetry,
  stopOrphanedBuild,
  summarizeResults,
  writeAttemptReport,
} from './browserstack-maestro-run.js'

// Mirrors the shape documented for GET /app-automate/maestro/v2/builds/{build_id}.
function buildFixture(overrides = {}) {
  return {
    id: '09119aa433f9899e92ff2bb3d62f3a7d22fb2b0f',
    framework: 'maestro',
    duration: 67,
    status: 'passed',
    input_capabilities: { devices: ['Samsung Galaxy Tab S9-13.0'], project: 'Maestro Nimiq Pay', app: 'NimiqPayAndroidApk' },
    start_time: '2026-09-24 12:17:34 UTC',
    app_details: { name: 'app-debug.apk' },
    test_suite_details: { name: 'nimiq-pay-tests.zip' },
    ...overrides,
  }
}

function sessionFixture(testcases, overrides = {}) {
  return {
    id: 'session-1',
    device: 'Samsung Galaxy Tab S9-13.0',
    status: 'passed',
    testcases: {
      count: testcases.length,
      data: [{ class: 'francisco_tests', testcases }],
    },
    ...overrides,
  }
}

function testcase(name, status, extra = {}) {
  return { name, status, duration: 12.5, ...extra }
}

// Excerpt of real failures of this suite (BrowserStack builds from Sept/Oct 2026).
const SESSION_NOT_STARTED = {
  status: 'error',
  reason: 'runtime-error',
  error: { message: 'Could not start a session : Something went wrong during test execution. Please try to run the test again.', code: null },
}

describe('parseEnvVariables', () => {
  it('collects repeated --env flags', () => {
    const variables = parseEnvVariables(['--app', 'X', '--env', 'APP_ID=com.nimiq.pay.debug', '--env', 'PIN=1111'])

    expect(variables).toEqual({ APP_ID: 'com.nimiq.pay.debug', PIN: '1111' })
  })

  it('returns nothing when --env is absent', () => {
    expect(parseEnvVariables(['--app', 'X'])).toEqual({})
  })

  it('keeps values containing "=" intact', () => {
    const variables = parseEnvVariables(['--env', 'TOKEN=a=b'])

    expect(variables).toEqual({ TOKEN: 'a=b' })
  })

  it('rejects entries without a key', () => {
    expect(() => parseEnvVariables(['--env', 'PIN'])).toThrow(/Expected KEY=VALUE/)
    expect(() => parseEnvVariables(['--env', '=1111'])).toThrow(/Expected KEY=VALUE/)
  })
})

describe('summarizeResults', () => {
  it('counts test cases by status and reports success', () => {
    const sessions = [sessionFixture([testcase('mini_apps_screen', 'passed'), testcase('mini_apps_search', 'passed')])]

    const summary = summarizeResults(buildFixture(), sessions)

    expect(summary.counts).toMatchObject({ passed: 2, failed: 0, error: 0, timedout: 0, skipped: 0 })
    expect(summary.rows).toHaveLength(2)
    expect(summary.ok).toBe(true)
  })

  it('fails when a test case fails even if the build status lags', () => {
    const sessions = [sessionFixture([testcase('mini_apps_screen', 'passed'), testcase('mini_apps_filter', 'failed')])]

    const summary = summarizeResults(buildFixture({ status: 'running' }), sessions)

    expect(summary.counts.failed).toBe(1)
    expect(summary.ok).toBe(false)
  })

  it('fails when the build reports a failure status without per-case counters', () => {
    const summary = summarizeResults(buildFixture({ status: 'failed' }), [sessionFixture([testcase('flow', 'passed')])])

    expect(summary.ok).toBe(false)
  })

  it('treats a build with no test cases as a failure (flow path did not match)', () => {
    const summary = summarizeResults(buildFixture({ status: 'passed' }), [sessionFixture([])])

    expect(summary.rows).toHaveLength(0)
    expect(summary.ok).toBe(false)
  })

  it('flags a session BrowserStack never started, whose test case stays queued', () => {
    // iOS run 39411645185: the session carried the error and its only test case stayed queued.
    const session = sessionFixture([testcase('flows/francisco_tests/returning_to_app_mini_apps', 'queued')], SESSION_NOT_STARTED)

    expect(summarizeResults(buildFixture({ status: 'error' }), [session]).neverStarted).toBe(true)
    expect(summarizeResults(buildFixture({ status: 'error' }), [{ ...session, error: undefined }]).neverStarted).toBe(false)
  })

  it('does not flag a session error once a test case finished, or without test cases', () => {
    const finished = sessionFixture([testcase('flows/francisco_tests/about', 'failed')], SESSION_NOT_STARTED)

    expect(summarizeResults(buildFixture({ status: 'error' }), [finished]).neverStarted).toBe(false)
    expect(summarizeResults(buildFixture({ status: 'error' }), [sessionFixture([], SESSION_NOT_STARTED)]).neverStarted).toBe(false)
  })

  it('judges each session by its own error and test cases', () => {
    const ran = sessionFixture([testcase('flows/francisco_tests/about', 'failed')], SESSION_NOT_STARTED)
    const queued = sessionFixture([testcase('flows/francisco_tests/about', 'queued')], { id: 'session-2' })

    expect(summarizeResults(buildFixture({ status: 'error' }), [ran, queued]).neverStarted).toBe(false)
  })

  it('never reports a build that is still running as passed', () => {
    // After a poll error the last known build can be mid-run with every reported row passed.
    const summary = summarizeResults(buildFixture({ status: 'running' }), [sessionFixture([testcase('flow', 'passed')])])

    expect(summary.ok).toBe(false)
  })

  it('fails on statuses it does not know', () => {
    const summary = summarizeResults(buildFixture(), [sessionFixture([testcase('flow', 'passed'), testcase('other', 'queued')])])

    expect(summary.ok).toBe(false)
  })

  it('counts a `timeout` test case as timed out', () => {
    const summary = summarizeResults(buildFixture({ status: 'failed' }), [sessionFixture([testcase('flow', 'timeout')])])

    expect(summary.counts.timedout).toBe(1)
  })

  it('accepts a finished `done` build whose test cases all passed', () => {
    const summary = summarizeResults(buildFixture({ status: 'done' }), [sessionFixture([testcase('flow', 'passed')])])

    expect(summary.ok).toBe(true)
  })

  it('fails when every test case was skipped', () => {
    const summary = summarizeResults(buildFixture(), [sessionFixture([testcase('flow', 'skipped')])])

    expect(summary.ok).toBe(false)
  })
})

// Excerpts of real failures of this suite (BrowserStack builds from Sept/Oct 2026).
const NOT_STARTED_TESTCASE = {
  name: 'flows/francisco_tests/top_up_flow',
  status: 'error',
  crash_logs_count: '0',
  metadata: { stacktrace: '', completed_flows: 0, total_flows: 0, status: 'ERROR' },
}
const ADB_LOST_COMMANDS = [
  { command: { launchAppCommand: {} }, metadata: { status: 'COMPLETED' } },
  {
    command: { assertConditionCommand: { condition: { visible: { textRegex: 'About' } } } },
    metadata: { status: 'FAILED', error: { message: 'UNAVAILABLE', cause: { message: 'Command failed (host:transport:R52W807J1TZ): device \'R52W807J1TZ\' not found' } } },
  },
]
const DRIVER_UNAVAILABLE_LOG = `18:06:56.391 [ INFO] maestro.Maestro.invoke: Getting device info
18:06:56.469 [ERROR] maestro.cli.runner.TestSuiteInteractor.runFlow: Failed to complete flow
io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException
\tat io.grpc.stub.ClientCalls.toStatusRuntimeException(ClientCalls.java:275)`
const NOT_INSTALLED_COMMANDS = [{
  command: { launchAppCommand: { appId: 'com.nimiq.pay.debug' } },
  metadata: { status: 'FAILED', error: { message: 'Unable to launch app com.nimiq.pay.debug: Package com.nimiq.pay.debug is not installed' } },
}]
const ASSERTION_LOG = `16:00:59.084 [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Tap on "Get Started" COMPLETED
16:01:05.112 [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible FAILED
16:01:05.113 [ INFO] maestro.Maestro.takeScreenshot: Taking screenshot`
const FAILED_TESTCASE = { name: 'flows/francisco_tests/about', status: 'failed', crash_logs_count: '0', metadata: { completed_flows: 1, total_flows: 1 } }

describe('diagnoseTestcase', () => {
  it('classifies a session BrowserStack never started as INFRA', () => {
    const verdict = diagnoseTestcase({ session: SESSION_NOT_STARTED, testcase: NOT_STARTED_TESTCASE })

    expect(verdict).toMatchObject({ diagnosis: 'INFRA', disposition: 'RETRYABLE' })
  })

  it('does not call it INFRA when flows ran despite the session error', () => {
    const verdict = diagnoseTestcase({ session: SESSION_NOT_STARTED, testcase: { ...NOT_STARTED_TESTCASE, metadata: { total_flows: 1 } } })

    expect(verdict.diagnosis).toBe('UNKNOWN')
  })

  it('sees through a `failed` assertion caused by the device dropping off ADB', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, commands: ADB_LOST_COMMANDS })

    expect(verdict).toMatchObject({ diagnosis: 'INFRA', disposition: 'RETRYABLE', signal: 'Device dropped off ADB' })
  })

  it('recognises an unreachable Maestro driver from the log when commands are unavailable', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: DRIVER_UNAVAILABLE_LOG })

    expect(verdict).toMatchObject({ diagnosis: 'INFRA', signal: 'Maestro driver unreachable' })
  })

  it('stops the suite when APP_ID does not match the uploaded app', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, commands: NOT_INSTALLED_COMMANDS, appId: 'com.nimiq.pay.debug', bundleId: 'com.nimiq.pay' })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'FATAL' })
  })

  it('blames only the flow when it hard-codes another package than the suite uses', () => {
    // The real 34e911c4 case: the flow pinned com.nimiq.pay.debug against the release upload.
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, commands: NOT_INSTALLED_COMMANDS, appId: 'com.nimiq.pay', bundleId: 'com.nimiq.pay' })

    expect(verdict).toMatchObject({ diagnosis: 'TEST_BUG', disposition: 'NO_RETRY' })
  })

  it('retries when the uploaded app itself is missing from the device', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, commands: NOT_INSTALLED_COMMANDS, appId: 'com.nimiq.pay.debug', bundleId: 'com.nimiq.pay.debug' })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'RETRYABLE' })
  })

  it('treats an `error` test case that never started a flow as INFRA without a session error', () => {
    // The real dc319f2a whole-folder build: 10 such test cases, no session.error.
    const verdict = diagnoseTestcase({ session: { status: 'failed', reason: 'runtime-error' }, testcase: NOT_STARTED_TESTCASE })

    expect(verdict.diagnosis).toBe('INFRA')
  })

  it('ignores a recovered driver hiccup earlier in the log than the failing step', () => {
    const log = `${DRIVER_UNAVAILABLE_LOG}
16:00:59.084 [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible RUNNING
${ASSERTION_LOG}`

    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: log })

    expect(verdict.diagnosis).toBe('UNKNOWN')
  })

  it('lets crash logs override an infra signature', () => {
    const verdict = diagnoseTestcase({ session: SESSION_NOT_STARTED, testcase: { ...NOT_STARTED_TESTCASE, crash_logs_count: '2' } })

    expect(verdict).toMatchObject({ diagnosis: 'APP_BUG', disposition: 'NO_RETRY' })
  })

  it('leaves a plain assertion failure UNKNOWN for a diagnostic rerun', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: ASSERTION_LOG })

    expect(verdict).toMatchObject({ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC' })
  })

  it('trusts the failing command over unrelated log noise', () => {
    // An earlier, recovered ADB hiccup in the log must not turn an assertion failure into INFRA.
    const commands = [{ command: { assertConditionCommand: {} }, metadata: { status: 'FAILED', error: { message: 'Assertion is false: "Pay" is visible' } } }]

    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: DRIVER_UNAVAILABLE_LOG, commands })

    expect(verdict.diagnosis).toBe('UNKNOWN')
  })
})

describe('findAppCrash', () => {
  const crashLog = `10-07 13:51:07.254 I/nimiq.pay.debug(31926): Late-enabling -Xcheck:jni
10-07 13:52:10.001 E/AndroidRuntime(31926): FATAL EXCEPTION: main
10-07 13:52:10.001 E/AndroidRuntime(31926): Process: com.nimiq.pay.debug, PID: 31926
10-07 13:52:10.002 E/AndroidRuntime(31926): java.lang.OutOfMemoryError: Failed to allocate`

  it('finds a fatal exception of the app under test', () => {
    expect(findAppCrash(crashLog, ['com.nimiq.pay.debug'])).toBe('FATAL EXCEPTION in com.nimiq.pay.debug')
  })

  it('ignores crashes of other packages', () => {
    expect(findAppCrash(crashLog.replace(/com\.nimiq\.pay\.debug/g, 'com.google.android.gms.persistent'), ['com.nimiq.pay.debug'])).toBeUndefined()
  })

  it('finds an ANR of the app under test', () => {
    expect(findAppCrash('10-07 13:52:10.001 E/ActivityManager( 1234): ANR in com.nimiq.pay.debug (com.nimiq.pay.debug/.MainActivity)', ['com.nimiq.pay.debug'])).toBe('ANR in com.nimiq.pay.debug')
  })

  it('cannot be faked from console output', () => {
    const fake = '10-07 13:52:10.001 I/Capacitor/Console(31926): Msg: E/AndroidRuntime(31926): FATAL EXCEPTION: main Process: com.nimiq.pay.debug, PID: 1'

    expect(findAppCrash(fake, ['com.nimiq.pay.debug'])).toBeUndefined()
  })

  // iOS device log of BrowserStack run 39940894400 (security_wrong_pin), shortened.
  const webContentCrashLog = `Oct 23 11:20:45 App(WebKit)[1342] <Error>: 0x1160f40c0 - [PID=1344] WebProcessProxy::didClose: (web process 0 crash)
Oct 23 11:20:45 App(WebKit)[1342] <Error>: 0x10dc1d518 - [pageProxyID=7, webPageID=8, PID=1344] WebPageProxy::dispatchProcessDidTerminate: reason=Crash
Oct 23 11:20:45 App(WebKit)[1342] <Notice>: 0x10dc1d518 - [pageProxyID=7, webPageID=8, PID=1344] WebPageProxy::reload:`

  it('finds a crash of the iOS app\'s web view content process', () => {
    expect(findAppCrash(webContentCrashLog, ['com.nimiq.pay'])).toBe('WebContent process (WebKit)')
  })

  it('ignores web view crashes of other iOS processes and other termination reasons', () => {
    expect(findAppCrash(webContentCrashLog.replace(/App\(WebKit\)/g, 'MobileSafari(WebKit)'), ['com.nimiq.pay'])).toBeUndefined()
    expect(findAppCrash('Oct 23 11:20:45 App(WebKit)[1342] <Error>: 0x1 - [pageProxyID=7, webPageID=8, PID=1344] WebPageProxy::dispatchProcessDidTerminate: reason=IdleExit', ['com.nimiq.pay'])).toBeUndefined()
  })

  it('cannot be faked from the iOS app\'s own log output', () => {
    const fake = 'Oct 23 11:20:45 App(CapgoCapacitorUpdater)[1342] <Error>: App(WebKit)[1342] <Error>: WebPageProxy::dispatchProcessDidTerminate: reason=Crash'

    expect(findAppCrash(fake, ['com.nimiq.pay'])).toBeUndefined()
  })

  it('turns an iOS web view crash into APP_BUG without a rerun', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: ASSERTION_LOG, deviceLog: webContentCrashLog, appId: 'com.nimiq.pay' })

    expect(verdict).toMatchObject({ diagnosis: 'APP_BUG', disposition: 'NO_RETRY', signal: 'App crashed: WebContent process (WebKit)' })
  })

  it('turns an infra-looking failure with an app crash in logcat into APP_BUG', () => {
    const verdict = diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: DRIVER_UNAVAILABLE_LOG, deviceLog: crashLog, appId: 'com.nimiq.pay.debug' })

    expect(verdict).toMatchObject({ diagnosis: 'APP_BUG', disposition: 'NO_RETRY' })
  })
})

describe('failureContext', () => {
  it('ignores app text in Maestro\'s element dumps', () => {
    // Break-it: a Mini App title crafted as an infra error forced an INFRA retry.
    const log = `a [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Tap on "Cinima" RUNNING
b [ INFO] maestro.Maestro.tap: Tapping on element:  UiElement(treeNode=TreeNode(attributes={text=Tickets. Command failed (host:transport:X): device 'X' not found}))
c [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Tap on "Cinima" FAILED`

    expect(diagnoseTestcase({ session: {}, testcase: FAILED_TESTCASE, maestroLog: log }).diagnosis).toBe('UNKNOWN')
  })

  it('keeps only the failing step from RUNNING to FAILED', () => {
    const log = `a [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Tap on "X" RUNNING
b [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Tap on "X" COMPLETED
c [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible RUNNING
d Caused by: java.io.IOException: device 'R5' not found
e [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible FAILED`

    expect(failureContext(log).split('\n').map(line => line[0])).toEqual(['c', 'd', 'e'])
  })

  it('tolerates trailing whitespace on the RUNNING line', () => {
    const log = `c [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible RUNNING \t
d Caused by: java.io.IOException: device 'R5' not found
e [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Assert that "Pay" is visible FAILED`

    expect(failureContext(log)).toContain('device \'R5\' not found')
  })

  it('falls back to the "Failed to complete flow" block when no step ran', () => {
    expect(failureContext(DRIVER_UNAVAILABLE_LOG)).toContain('StatusRuntimeException: UNAVAILABLE')
  })
})

describe('findFailingStep', () => {
  it('returns the last step Maestro logged as FAILED', () => {
    expect(findFailingStep(ASSERTION_LOG)).toBe('Assert that "Pay" is visible')
  })

  it('returns undefined when nothing failed', () => {
    expect(findFailingStep('')).toBeUndefined()
  })
})

describe('diagnoseAttempt', () => {
  const failedSummary = { ok: false, rows: [{}], buildStatus: 'failed' }

  it('puts a crash before a retryable sibling', () => {
    const verdict = diagnoseAttempt(failedSummary, [
      { diagnosis: 'INFRA', disposition: 'RETRYABLE' },
      { diagnosis: 'APP_BUG', disposition: 'NO_RETRY' },
    ])

    expect(verdict.diagnosis).toBe('APP_BUG')
  })

  it('treats API failures as a retryable harness problem when nothing says the build failed', () => {
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'unknown' }, [], { waitError: Object.assign(new Error('x'), { transient: true }) })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'RETRYABLE' })
  })

  it('never lets an API error after a recorded failure make it retryable', () => {
    // Break-it B1: an assertion failure followed by poll errors became PASSED_ON_RETRY.
    const verdict = diagnoseAttempt(failedSummary, [{ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC', failingStep: 'Assert that "Settings" is visible' }], { waitError: new Error('500') })

    expect(verdict).toMatchObject({ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC' })
  })

  it('reruns as a diagnostic when the build failed but its sessions could not be read', () => {
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'failed' }, [], { sessionsError: new Error('500') })

    expect(verdict).toMatchObject({ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC' })
  })

  it('keeps a pass green but surfaces crash logs captured during it', () => {
    const verdict = diagnoseAttempt({ ok: true, rows: [{}], buildStatus: 'passed', crashLogs: 1 })

    expect(verdict).toMatchObject({ diagnosis: 'PASSED', signal: 'Passed, but app crash logs were captured (1)' })
  })

  it('reruns a build that hit our timeout as a diagnostic', () => {
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'running' }, [], { waitError: Object.assign(new Error('Timed out'), { timedOut: true }) })

    expect(verdict).toMatchObject({ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC' })
  })

  it('stops the suite when the API was unreachable for the whole wait', () => {
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'unknown' }, [], { waitError: Object.assign(new Error('Timed out'), { timedOut: true, apiUnreachable: true }) })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'FATAL' })
  })

  it('stops the suite on an API outage even when the stopped build reads like infra', () => {
    const outage = Object.assign(new Error('Timed out'), { timedOut: true, apiUnreachable: true })

    expect(diagnoseAttempt(failedSummary, [{ diagnosis: 'INFRA', disposition: 'RETRYABLE' }], { waitError: outage }))
      .toMatchObject({ diagnosis: 'HARNESS', disposition: 'FATAL' })
    expect(diagnoseAttempt(failedSummary, [{ diagnosis: 'APP_BUG', disposition: 'NO_RETRY' }], { waitError: outage }).diagnosis)
      .toBe('APP_BUG')
  })

  it('keeps a captured crash even when the build also timed out', () => {
    const verdict = diagnoseAttempt(failedSummary, [{ diagnosis: 'APP_BUG', disposition: 'NO_RETRY' }], { waitError: Object.assign(new Error('Timed out'), { timedOut: true }) })

    expect(verdict.diagnosis).toBe('APP_BUG')
  })

  it('does not stop the suite when only reading the sessions failed', () => {
    // Empty rows here mean "unknown", not "the flow path did not match".
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'passed' }, [], { sessionsError: new Error('404') })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'RETRYABLE' })
  })

  it('retries a build whose session BrowserStack never started, even after a poll error', () => {
    // iOS run 39411645185: the session errored and its only test case stayed queued.
    const queued = [testcase('flows/francisco_tests/returning_to_app_mini_apps', 'queued')]
    const summary = summarizeResults(buildFixture({ status: 'error' }), [sessionFixture(queued, SESSION_NOT_STARTED)])

    expect(diagnoseAttempt(summary)).toMatchObject({ diagnosis: 'INFRA', disposition: 'RETRYABLE' })
    expect(diagnoseAttempt({ ...summary, buildStatus: 'stopped' }, [], { waitError: Object.assign(new Error('500'), { transient: true }) }))
      .toMatchObject({ diagnosis: 'INFRA', disposition: 'RETRYABLE' })
    // The same build without the session error stays a diagnostic rerun.
    expect(diagnoseAttempt(summarizeResults(buildFixture({ status: 'error' }), [sessionFixture(queued)])))
      .toMatchObject({ diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC' })
  })

  it('does not retry a finished build without test cases, nor stop the suite for it', () => {
    const verdict = diagnoseAttempt({ ok: false, rows: [], buildStatus: 'passed' })

    expect(verdict).toMatchObject({ diagnosis: 'HARNESS', disposition: 'NO_RETRY' })
  })
})

describe('shouldRetry', () => {
  const options = { attemptNumber: 1, maxAttempts: 2, secondsLeft: 5000, timeoutSeconds: 900 }

  it('retries retryable and diagnostic attempts', () => {
    expect(shouldRetry({ disposition: 'RETRYABLE' }, options)).toBe(true)
    expect(shouldRetry({ disposition: 'DIAGNOSTIC' }, options)).toBe(true)
  })

  it('never retries app bugs, fatal problems or passes', () => {
    for (const disposition of ['NO_RETRY', 'FATAL', 'NONE']) {
      expect(shouldRetry({ disposition }, options)).toBe(false)
    }
  })

  it('respects the attempt cap and the wall-clock budget', () => {
    expect(shouldRetry({ disposition: 'RETRYABLE' }, { ...options, attemptNumber: 2 })).toBe(false)
    expect(shouldRetry({ disposition: 'RETRYABLE' }, { ...options, secondsLeft: 600 })).toBe(false)
  })
})

describe('resolveOutcome', () => {
  const passed = { diagnosis: 'PASSED', disposition: 'NONE' }
  const infra = { diagnosis: 'INFRA', disposition: 'RETRYABLE' }
  const unknown = { diagnosis: 'UNKNOWN', disposition: 'DIAGNOSTIC', failingStep: 'Assert that "Pay" is visible' }

  it('passes on the first attempt', () => {
    expect(resolveOutcome([passed])).toEqual({ outcome: 'PASSED', ok: true })
  })

  it('accepts a pass after an infra retry', () => {
    expect(resolveOutcome([infra, passed])).toEqual({ outcome: 'PASSED_ON_RETRY', ok: true })
  })

  it('never turns a diagnostic rerun into green', () => {
    expect(resolveOutcome([unknown, passed])).toEqual({ outcome: 'INTERMITTENT', ok: false })
  })

  it('marks a failure at the same step twice as deterministic', () => {
    expect(resolveOutcome([unknown, { ...unknown }])).toEqual({ outcome: 'DETERMINISTIC', ok: false })
  })

  it('takes the cause a diagnostic rerun finds, but not an infra hiccup on it', () => {
    expect(resolveOutcome([unknown, { diagnosis: 'TEST_BUG', disposition: 'NO_RETRY' }])).toEqual({ outcome: 'TEST_BUG', ok: false })
    expect(resolveOutcome([unknown, infra])).toEqual({ outcome: 'UNKNOWN', ok: false })
  })

  it('stays UNKNOWN when the rerun failed elsewhere', () => {
    expect(resolveOutcome([unknown, { ...unknown, failingStep: 'Tap on "Settings"' }])).toEqual({ outcome: 'UNKNOWN', ok: false })
  })

  it('reports infra twice as INFRA', () => {
    expect(resolveOutcome([infra, infra])).toEqual({ outcome: 'INFRA', ok: false })
  })

  it('never turns a diagnostic rerun green, even after an earlier infra retry', () => {
    expect(resolveOutcome([infra, unknown, passed])).toEqual({ outcome: 'INTERMITTENT', ok: false })
  })
})

describe('redactEnvValues', () => {
  it('masks setEnvVariables wherever it appears', () => {
    const redacted = redactEnvValues({ build: { input_capabilities: { setEnvVariables: { PIN: '1111', APP_ID: 'x' } } }, sessions: [{ setEnvVariables: { PIN: '1111' } }] })

    expect(redacted.build.input_capabilities.setEnvVariables).toEqual({ PIN: '***', APP_ID: '***' })
    expect(redacted.sessions[0].setEnvVariables).toEqual({ PIN: '***' })
  })

  it('masks setEnvVariables returned as a JSON string', () => {
    expect(redactEnvValues({ setEnvVariables: '{"PIN":"1111"}' })).toEqual({ setEnvVariables: '***' })
  })
})

// Shaped like a recovery phrase; never a real wallet's words.
const SECRET_PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access device'
const SECRET_WORD = /\b(?:abandon|ability|able|about|above|absent|absorb|abstract|absurd|abuse|access|device)\b/i

describe('redactSecrets', () => {
  it('masks every word of a recovery phrase where Maestro logs the env and typed text', () => {
    const log = [
      `DefineVariablesCommand(env={APP_ID=com.nimiq.pay.debug, MAESTRO_TESTNET_WALLET_WORDS=${SECRET_PHRASE}})`,
      'evaluatedCommand=MaestroCommand(inputTextCommand=InputTextCommand(text=absurd, label=null))',
      '13:19:12.376 [ INFO] maestro.Maestro.inputText: Inputting text: absurd',
    ].join('\n')

    const redacted = redactSecrets(log, [SECRET_PHRASE])

    expect(redacted).not.toMatch(SECRET_WORD)
    expect(redacted).toContain('APP_ID=com.nimiq.pay.debug')
    expect(redacted).toContain('Inputting text: [redacted]')
  })

  it('masks words in any case and right after JSON escapes', () => {
    expect(redactSecrets('Abandon\\nability ACCESS text\\u003dabout', [SECRET_PHRASE]))
      .toBe('[redacted]\\n[redacted] [redacted] text\\u003d[redacted]')
  })

  it('masks words next to digits, URL escapes and ANSI colour codes', () => {
    expect(redactSecrets('01abandon abuse1 a%2Fability \u001B[32mabsurd \\u001b[1maccess', [SECRET_PHRASE]))
      .toBe('01[redacted] [redacted]1 a%2F[redacted] \u001B[32m[redacted] \\u001b[1m[redacted]')
  })

  it('keeps words that only contain a secret word', () => {
    expect(redactSecrets('enable capable abandoned devices', [SECRET_PHRASE])).toBe('enable capable abandoned devices')
  })

  it('masks words next to UTF-8 punctuation and letters read as latin1', () => {
    // Evidence is masked as latin1, where the bytes of "…" or "é" read as letters such as "â".
    const latin1 = Buffer.from('ability… éable', 'utf8').toString('latin1')

    expect(redactSecrets(latin1, [SECRET_PHRASE])).not.toMatch(SECRET_WORD)
  })

  it('returns the text unchanged without secrets', () => {
    expect(redactSecrets('abandon ability', [])).toBe('abandon ability')
  })
})

describe('findSecretWordSources', () => {
  it('names the sources that share a whole word with a secret, in any case', () => {
    const sources = { 'flows/a.yaml': 'Tap on "Access"', 'flows/b.yaml': 'capable devices abandoned', 'wording': 'about' }

    expect(findSecretWordSources([SECRET_PHRASE], sources)).toEqual(['flows/a.yaml', 'wording'])
  })

  it('splits words at non-ASCII letters, like the masking does', () => {
    expect(findSecretWordSources([SECRET_PHRASE], { 'flows/c.yaml': 'aboutée' })).toEqual(['flows/c.yaml'])
  })
})

describe('readReservedWordSources', () => {
  it('keeps flow text, inline comments and file paths, but drops full-line comments and folders that are not uploaded', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-suite-'))
    try {
      fs.mkdirSync(path.join(directory, 'flows'))
      fs.mkdirSync(path.join(directory, 'tests_output'))
      fs.writeFileSync(path.join(directory, 'flows', 'absent_flow.yaml'), '# abandon\n- assertTrue:\n    label: "Pay order # ability"\n')
      fs.writeFileSync(path.join(directory, 'page.js'), '/**\n * absorb\n */\nconst url = \'https://x.test/able\' // abuse\n')
      fs.writeFileSync(path.join(directory, 'tests_output', 'access.yaml'), 'access')

      const text = Object.values(readReservedWordSources(directory)).join('\n')

      expect(text).toMatch(/\bability\b/)
      expect(text).toMatch(/\bable\b/)
      expect(text).toMatch(/\babuse\b/)
      expect(text).toMatch(/\babsent_flow\b/)
      expect(text).not.toMatch(/\b(?:abandon|absorb|access)\b/)
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('prepareSecrets', () => {
  it('sends and masks the named values, and reports sources sharing a word', () => {
    const prepared = prepareSecrets(['WORDS'], { WORDS: SECRET_PHRASE }, () => ({ 'flows/a.yaml': 'about', 'flows/b.yaml': 'zoo' }))

    expect(prepared).toEqual({ variables: { WORDS: SECRET_PHRASE }, secrets: [SECRET_PHRASE], reservedSources: ['flows/a.yaml'] })
  })

  it('refuses an unset variable and reads no sources without secrets', () => {
    expect(() => prepareSecrets(['WORDS'], {}, () => ({}))).toThrow(/WORDS: the environment variable is not set/)
    const readSources = () => {
      throw new Error('read')
    }
    expect(prepareSecrets([], {}, readSources)).toEqual({ variables: {}, secrets: [], reservedSources: [] })
  })
})

describe('writeAttemptReport', () => {
  it('masks secrets in published values only, never in keys or the page template', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-report-'))
    try {
      // "crash" and "family" are in a JSON key and in the page's CSS; "abandon" is a leaked value.
      const secrets = ['crash family abandon']
      const build = buildFixture({ status: 'failed', input_capabilities: { setEnvVariables: { WORDS: 'crash family abandon' } } })
      const sessions = [sessionFixture([testcase('flow', 'failed', { crash_logs_count: '0', metadata: { stacktrace: 'Input text abandon failed' } })])]

      writeAttemptReport(directory, { build, sessions }, { secrets })

      const json = fs.readFileSync(path.join(directory, 'build.json'), 'utf8')
      const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
      expect(json).toContain('"crash_logs_count"')
      expect(json).toContain('Input text [redacted] failed')
      expect(json).not.toMatch(/abandon/)
      expect(JSON.parse(json).build.input_capabilities.setEnvVariables).toEqual({ WORDS: '***' })
      expect(html).toContain('font-family')
      expect(html).not.toMatch(/abandon/)
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('collectEvidence', () => {
  const ARTIFACTS = {
    'https://api.browserstack.com/log': { key: 'maestro_log', contentType: 'text/plain', body: `${ASSERTION_LOG}
16:01:06.000 [ INFO] maestro.cli.runner.TestSuiteInteractor.invoke: Input text absurd FAILED` },
    'https://api.browserstack.com/commands': {
      key: 'maestro_commands',
      contentType: 'application/json',
      body: JSON.stringify([{ command: { inputTextCommand: { text: 'absurd' } }, metadata: { status: 'FAILED', error: { message: 'UNAVAILABLE', cause: { message: 'Command failed (host:transport:R52W807J1TZ): device \'R52W807J1TZ\' not found' } } } }]),
    },
    // The 0xE9 byte is not UTF-8; masking must leave it alone.
    'https://api.browserstack.com/logcat': { key: 'device_log', contentType: 'text/plain', body: Buffer.concat([Buffer.from('10-08 13:19:12.380 I/IME( 812): commit text=ability '), Buffer.from([0xE9])]) },
    'https://api.browserstack.com/network': { key: 'network_log', contentType: 'application/gzip', body: zlib.gzipSync('request text=abuse') },
    // A screenshot zip can show the words on screen, but images cannot be masked; recognised by
    // content even when served as octet-stream.
    'https://api.browserstack.com/screenshots': { key: 'screenshots', contentType: 'application/octet-stream', body: 'PK\u0003\u0004screen_device_1.png' },
  }
  const ALL_ARTIFACTS_TESTCASE = { ...FAILED_TESTCASE, ...Object.fromEntries(Object.entries(ARTIFACTS).map(([url, { key }]) => [key, url])) }

  it('writes no secret word to the evidence or the failing step, and keeps no screenshots', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-evidence-'))
    try {
      const downloaded = []
      const download = async (url) => {
        downloaded.push(url)
        return { status: 200, contentType: ARTIFACTS[url].contentType, buffer: Buffer.from(ARTIFACTS[url].body) }
      }

      const result = await collectEvidence(download, { session: { id: 's1', status: 'failed' }, testcase: ALL_ARTIFACTS_TESTCASE, appId: 'com.nimiq.pay.debug', bundleId: 'com.nimiq.pay.debug', secrets: [SECRET_PHRASE] }, directory)

      for (const file of ['maestro_log.txt', 'maestro_commands.json', 'device_log.txt', 'network_log.bin', 'evidence.json']) {
        expect(fs.readFileSync(path.join(directory, file), 'utf8')).not.toMatch(SECRET_WORD)
      }
      expect(fs.readFileSync(path.join(directory, 'device_log.txt')).at(-1)).toBe(0xE9)
      expect(fs.readFileSync(path.join(directory, 'network_log.bin'), 'utf8')).toBe('request text=[redacted]')
      expect(result.failingStep).toBe('Input text [redacted]')
      // The Login screen shows the typed words: never downloaded, and evidence.json says why.
      expect(downloaded).not.toContain('https://api.browserstack.com/screenshots')
      expect(fs.existsSync(path.join(directory, 'screenshots.zip'))).toBe(false)
      expect(JSON.parse(fs.readFileSync(path.join(directory, 'evidence.json'), 'utf8')).files.screenshots).toMatch(/^withheld: the flow ran with a secret/)
      // Diagnosed from the unmasked evidence: "device" is a secret word here, yet the ADB signature still matches.
      expect(result.signal).toBe('Device dropped off ADB')
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps the screenshots as-is when the flow ran without a secret', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-evidence-'))
    try {
      const download = async url => ({ status: 200, contentType: ARTIFACTS[url].contentType, buffer: Buffer.from(ARTIFACTS[url].body) })

      await collectEvidence(download, { session: { id: 's1', status: 'failed' }, testcase: ALL_ARTIFACTS_TESTCASE, appId: 'com.nimiq.pay.debug', bundleId: 'com.nimiq.pay.debug' }, directory)

      expect(fs.readFileSync(path.join(directory, 'screenshots.zip'))).toEqual(Buffer.from(ARTIFACTS['https://api.browserstack.com/screenshots'].body))
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('withholds a zip under any key but screenshots, since it cannot be masked', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-evidence-'))
    try {
      const download = async () => ({ status: 200, contentType: 'application/zip', buffer: Buffer.from('PK\u0003\u0004text=abandon') })

      await collectEvidence(download, { session: { id: 's1', status: 'failed' }, testcase: { ...FAILED_TESTCASE, commands_log: 'https://api.browserstack.com/commands-log' }, secrets: [SECRET_PHRASE] }, directory)

      expect(fs.readdirSync(directory)).toEqual(['evidence.json'])
      expect(JSON.parse(fs.readFileSync(path.join(directory, 'evidence.json'), 'utf8')).files.commands_log).toMatch(/^withheld/)
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps a saved maestro_commands that is not valid JSON listed as saved', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-evidence-'))
    try {
      const download = async () => ({ status: 200, contentType: 'application/json', buffer: Buffer.from('[{"command": ') })

      await collectEvidence(download, { session: { id: 's1', status: 'failed' }, testcase: { ...FAILED_TESTCASE, maestro_commands: 'https://api.browserstack.com/commands' } }, directory)

      const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'evidence.json'), 'utf8'))
      expect(evidence.files.maestro_commands).toMatch(/^maestro_commands\.json \(not valid JSON/)
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('renderReport', () => {
  it('renders the build summary, counters and dashboard link', () => {
    const sessions = [sessionFixture([testcase('mini_apps_cinima_app', 'passed')])]

    const html = renderReport(buildFixture(), sessions)

    expect(html).toContain('Maestro test report')
    expect(html).toContain('09119aa433f9899e92ff2bb3d62f3a7d22fb2b0f')
    expect(html).toContain('https://app-automate.browserstack.com/dashboard/v2/builds/09119aa433f9899e92ff2bb3d62f3a7d22fb2b0f')
    expect(html).toContain('mini_apps_cinima_app')
    expect(html).toContain('passed: <strong>1</strong>')
    expect(html).toContain('Samsung Galaxy Tab S9-13.0')
  })

  it('escapes values coming from the API', () => {
    const sessions = [sessionFixture([testcase('<script>alert(1)</script>', 'passed')])]

    const html = renderReport(buildFixture(), sessions)

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('states when no test cases were reported', () => {
    const html = renderReport(buildFixture({ status: 'error' }), [sessionFixture([])])

    expect(html).toContain('No test cases were reported')
  })

  it('links the artifacts each test case exposes', () => {
    const sessions = [sessionFixture([testcase('flow', 'passed', {
      video: 'https://api.browserstack.com/video/1',
      device_log: 'https://api.browserstack.com/device/1',
    })])]

    const html = renderReport(buildFixture(), sessions)

    expect(html).toContain('href="https://api.browserstack.com/video/1"')
    expect(html).toContain('href="https://api.browserstack.com/device/1"')
  })
})

describe('parseBrowserStackTime', () => {
  it('reads the build list format as UTC', () => {
    expect(parseBrowserStackTime('2026-09-24 18:05:08 UTC')).toBe(Date.UTC(2026, 8, 24, 18, 5, 8))
  })

  it('returns NaN for missing values, which never counts as recent', () => {
    expect(parseBrowserStackTime(undefined)).toBeNaN()
  })
})

describe('stopOrphanedBuild', () => {
  const postedAt = Date.UTC(2026, 9, 19, 12, 0, 0)
  const flow = ['flows/francisco_tests/about.yaml']

  async function stoppedBuilds(builds, payload) {
    const stopped = []
    const request = async (endpoint, options) => {
      if (endpoint === '/builds?limit=10') {
        return builds.map(({ id }) => ({ id, start_time: '2026-10-19 12:00:05 UTC' }))
      }
      if (options?.method === 'POST') {
        stopped.push(endpoint.match(/builds\/([^/]+)\/stop$/)[1])
        return {}
      }
      return builds.find(({ id }) => endpoint === `/builds/${id}`)
    }
    await stopOrphanedBuild(request, payload, postedAt)
    return stopped
  }

  it('stops only the running build of the same flow on the same device', async () => {
    const builds = [
      { id: 'android', status: 'running', input_capabilities: { execute: flow, devices: ['Samsung Galaxy S26-16.0'] } },
      { id: 'ios', status: 'running', input_capabilities: { execute: flow, devices: ['iPhone 17 Pro-26'] } },
      { id: 'ios-done', status: 'passed', input_capabilities: { execute: flow, devices: ['iPhone 17 Pro-26'] } },
    ]
    expect(await stoppedBuilds(builds, { execute: flow, devices: ['iPhone 17 Pro-26'] })).toEqual(['ios'])
  })
})
