import { describe, expect, it } from 'vitest'
import { parseEnvVariables, renderReport, summarizeResults } from './browserstack-maestro-run.js'

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
