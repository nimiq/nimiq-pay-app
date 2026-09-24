import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import process, { env } from 'node:process'
import { fileURLToPath } from 'node:url'

const API_BASE_URL = 'https://api-cloud.browserstack.com/app-automate/maestro/v2'
const POLL_INTERVAL_MS = 10_000
const DEFAULT_TIMEOUT_SECONDS = 1500

// Statuses BrowserStack reports while a Maestro build is still in flight. Anything else
// means the build finished and can be reported on.
const NON_TERMINAL_STATUSES = new Set(['running', 'queued', 'pending', 'in_progress', 'created', 'scheduled', 'starting'])
const FAILED_STATUSES = new Set(['failed', 'error', 'timeout', 'timedout', 'cancelled', 'aborted'])

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

Options:
  --app <value>            BrowserStack app identifier or custom_id (required)
  --suite <value>          BrowserStack test suite identifier or custom_id (required)
  --device <value>         BrowserStack device string, required, e.g. "Google Pixel 7 Pro-13.0"
  --flow <value>           Flow file or folder inside the uploaded suite to execute (default: flows/francisco_tests/create_new_account_with_pageObject_browserstack.yaml)
  --env <KEY=VALUE>        Environment variable exposed to the flows via BrowserStack's
                           setEnvVariables; repeat for several (e.g. APP_ID, PIN)
  --project <value>        BrowserStack project name (default: Maestro Nimiq Pay)
  --output <value>         Report directory, or an .html file path (default: nimiq-pay-tests/tests_output/maestro_report.html)
  --timeout <seconds>      How long to wait for the build to finish (default: 1500)
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

/**
 * Flatten the per-device session responses into one row per test case, plus the counters
 * BrowserStack reports per build. `ok` drives the process exit code: a build that reports no
 * test cases at all is treated as a failure, since that usually means the flow path in
 * `execute` did not match anything inside the uploaded suite.
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
        })
      }
    }
  }

  const counts = { passed: 0, failed: 0, skipped: 0, error: 0, timedout: 0 }
  for (const row of rows) {
    const status = String(row.status ?? '').toLowerCase()
    if (status in counts) {
      counts[status] += 1
    }
  }

  const buildStatus = String(build?.status ?? '').toLowerCase()
  const failures = counts.failed + counts.error + counts.timedout
  const ok = rows.length > 0 && failures === 0 && !FAILED_STATUSES.has(buildStatus)

  return { rows, counts, buildStatus, ok }
}

export function renderReport(build, sessions) {
  const { rows, counts, buildStatus, ok } = summarizeResults(build, sessions)

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
<title>Maestro report — ${escapeHtml(buildStatus || 'unknown')}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <h1>Maestro test report</h1>
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

  return async function request(endpoint, init = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...init,
      headers: { Authorization: authorization, ...(init.headers ?? {}) },
    })
    const body = await response.text()

    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${endpoint} failed with ${response.status}: ${body.slice(0, 300)}`)
    }

    return JSON.parse(body)
  }
}

async function waitForBuild(request, buildId, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  let build = await request(`/builds/${buildId}`)
  let lastStatus = build.status

  console.log(`   status: ${lastStatus}`)

  while (NON_TERMINAL_STATUSES.has(String(build.status).toLowerCase())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutSeconds}s waiting for build ${buildId} (last status: ${lastStatus}).`)
    }

    await sleep(POLL_INTERVAL_MS)
    build = await request(`/builds/${buildId}`)

    if (build.status !== lastStatus) {
      lastStatus = build.status
      console.log(`   status: ${lastStatus}`)
    }
  }

  return build
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

function resolveReportPaths(output) {
  // The report is a directory (index.html + build.json) so it can be published as-is, but an
  // explicit .html path is honoured for callers that only want the page.
  const htmlPath = /\.html?$/i.test(output) ? output : path.join(output, 'index.html')
  const directory = path.dirname(htmlPath)
  fs.mkdirSync(directory, { recursive: true })
  return { htmlPath, jsonPath: path.join(directory, 'build.json') }
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
  const app = getArgValue(args, '--app', env.BROWSERSTACK_APP_ID)
  const suite = getArgValue(args, '--suite', env.BROWSERSTACK_TEST_SUITE_ID)
  const device = getArgValue(args, '--device', env.BROWSERSTACK_DEVICE)
  const flow = getArgValue(args, '--flow', 'flows/francisco_tests/create_new_account_with_pageObject_browserstack.yaml')
  const project = getArgValue(args, '--project', 'Maestro Nimiq Pay')
  const output = getArgValue(args, '--output', 'nimiq-pay-tests/tests_output/maestro_report.html')
  const timeoutSeconds = Number(getArgValue(args, '--timeout', String(DEFAULT_TIMEOUT_SECONDS)))

  if (!username || !accessKey) {
    throw new Error('BrowserStack credentials not found. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY or pass --username/--access-key.')
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

  const request = createApiClient(username, accessKey)
  const envVariables = parseEnvVariables(args)
  const payload = {
    app,
    testSuite: suite,
    project,
    devices: [device],
    execute: [flow],
  }

  if (Object.keys(envVariables).length > 0) {
    payload.setEnvVariables = envVariables
  }

  console.log('🚀 Starting BrowserStack Maestro build...')
  console.log(`📄 Maestro report output: ${output}`)
  // Env values are for credentials as often as not, so only the keys are echoed.
  console.log(JSON.stringify({
    ...payload,
    ...(payload.setEnvVariables
      ? { setEnvVariables: Object.fromEntries(Object.keys(envVariables).map(key => [key, '***'])) }
      : {}),
  }, null, 2))

  const started = await request('/android/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const buildId = started?.build_id
  if (!buildId) {
    throw new Error(`BrowserStack did not return a build id: ${JSON.stringify(started).slice(0, 200)}`)
  }

  console.log(`✅ Build started: ${buildId}`)
  console.log(`⏳ Waiting for the build to finish (timeout ${timeoutSeconds}s)...`)

  let build
  let waitError
  try {
    build = await waitForBuild(request, buildId, timeoutSeconds)
  }
  catch (error) {
    waitError = error
    // Report what BrowserStack has so far: a stalled build must not leave the report missing,
    // which is what used to fail the publish step.
    build = await request(`/builds/${buildId}`).catch(() => null)
  }

  if (!build) {
    throw waitError
  }

  const sessions = await collectSessions(request, buildId, build).catch((error) => {
    console.error(`⚠️ Could not read every session: ${error.message}`)
    return []
  })
  const { rows, counts, buildStatus, ok } = summarizeResults(build, sessions)

  const { htmlPath, jsonPath } = resolveReportPaths(output)
  fs.writeFileSync(htmlPath, renderReport(build, sessions))
  fs.writeFileSync(jsonPath, JSON.stringify({ build, sessions }, null, 2))

  console.log('📊 Results')
  console.log(`   status:   ${buildStatus}`)
  console.log(`   passed:   ${counts.passed}`)
  console.log(`   failed:   ${counts.failed}`)
  console.log(`   error:    ${counts.error}`)
  console.log(`   timedout: ${counts.timedout}`)
  console.log(`   skipped:  ${counts.skipped}`)
  console.log(`📝 Report written to ${htmlPath}`)
  console.log(`📝 Raw build data written to ${jsonPath}`)

  if (waitError) {
    console.error(`❌ ${waitError.message}`)
  }

  if (rows.length === 0) {
    console.error(`❌ No test cases were reported. Check that "${flow}" exists inside the uploaded suite (paths are relative to the suite's root folder).`)
  }

  if (buildStatus !== 'passed') {
    console.error(`❌ BrowserStack build finished with status "${buildStatus}".`)
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
