import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
  }[char]))
}

function getTestcases(sessions = []) {
  const testcases = []

  for (const session of sessions) {
    for (const group of session.testcases?.data ?? []) {
      for (const testcase of group.testcases ?? []) {
        testcases.push({
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

  return testcases
}

function artifactLinks(testcase) {
  return [
    ['video', testcase.video],
    ['device log', testcase.deviceLog],
    ['Maestro log', testcase.maestroLog],
    ['screenshots', testcase.screenshots],
  ].filter(([, url]) => url).map(([label, url]) => {
    let href
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        href = parsedUrl.href
      }
    }
    catch {
      // Ignore malformed artifact URLs while keeping the test result visible.
    }

    return href ? `<a href="${escapeHtml(href)}">${label}</a>` : ''
  }).filter(Boolean).join(' · ')
}

export function renderAggregateReport(flows) {
  const counts = { passed: 0, failed: 0, error: 0, timedout: 0, skipped: 0, unknown: 0, unavailable: 0 }
  const rows = []

  for (const flow of flows) {
    if (!flow.report) {
      counts.unavailable += 1
      rows.push(`<tr>
        <td>${escapeHtml(flow.name)}</td>
        <td colspan="6"><span class="badge unavailable">Report unavailable</span>${flow.error ? ` — ${escapeHtml(flow.error)}` : ''}</td>
      </tr>`)
      continue
    }

    const testcases = getTestcases(flow.report.sessions)
    if (testcases.length === 0) {
      counts.unknown += 1
      rows.push(`<tr>
        <td><a href="${escapeHtml(encodeURIComponent(flow.name))}/index.html">${escapeHtml(flow.name)}</a></td>
        <td>—</td>
        <td><span class="badge unknown">No test cases</span></td>
        <td>—</td>
        <td>—</td>
        <td><span class="badge ${escapeHtml(flow.report.build?.status ?? 'unknown')}">${escapeHtml(flow.report.build?.status ?? 'unknown')}</span></td>
        <td><a href="${escapeHtml(encodeURIComponent(flow.name))}/index.html">Flow report</a></td>
      </tr>`)
      continue
    }

    for (const testcase of testcases) {
      const status = String(testcase.status ?? 'unknown').toLowerCase()
      counts[status in counts ? status : 'unknown'] += 1
      const duration = testcase.duration === null || testcase.duration === undefined ? '—' : `${escapeHtml(testcase.duration)}s`
      const buildId = flow.report.build?.id
      const flowLinks = [
        buildId && `<a href="https://app-automate.browserstack.com/dashboard/v2/builds/${encodeURIComponent(buildId)}">BrowserStack build</a>`,
      ].filter(Boolean).join(' · ')

      rows.push(`<tr>
        <td><a href="${escapeHtml(encodeURIComponent(flow.name))}/index.html">${escapeHtml(flow.name)}</a></td>
        <td>${escapeHtml(testcase.device ?? '—')}</td>
        <td><code>${escapeHtml(testcase.name ?? '—')}</code></td>
        <td><span class="badge ${escapeHtml(status)}">${escapeHtml(testcase.status ?? 'unknown')}</span></td>
        <td>${duration}</td>
        <td><span class="badge ${escapeHtml(flow.report.build?.status ?? 'unknown')}">${escapeHtml(flow.report.build?.status ?? 'unknown')}</span></td>
        <td>${[artifactLinks(testcase), flowLinks].filter(Boolean).join(' · ') || '—'}</td>
      </tr>`)
    }
  }

  const countMarkup = Object.entries(counts)
    .map(([status, count]) => `<span>${escapeHtml(status)}: <strong>${count}</strong></span>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maestro suite results</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f7f7f9; color: #1b1b1f; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  .counts { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 0 0 18px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eceef1; font-size: 13px; vertical-align: top; }
  th { background: #fafafb; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #5c5c66; }
  tr:last-child td { border-bottom: none; }
  a { color: #0b6bcb; }
  code { background: #f2f3f5; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; text-transform: uppercase; }
  .passed { background: #e3f6e8; color: #1a7f37; }
  .failed, .error, .timedout { background: #fde8e8; color: #b42318; }
  .skipped, .unavailable, .unknown { background: #eceef1; color: #5c5c66; }
</style>
</head>
<body>
  <h1>Maestro suite results</h1>
  <p class="counts">${countMarkup}</p>
  <table>
    <thead><tr><th>Flow</th><th>Device</th><th>Test</th><th>Status</th><th>Duration</th><th>Build</th><th>Links</th></tr></thead>
    <tbody>${rows.join('') || '<tr><td colspan="7">No flow reports were found.</td></tr>'}</tbody>
  </table>
</body>
</html>
`
}

export function generateAggregateReport(reportsDirectory) {
  fs.mkdirSync(reportsDirectory, { recursive: true })
  const flowDirectories = fs.readdirSync(reportsDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))

  const flows = flowDirectories.map(({ name }) => {
    const flowDirectory = path.join(reportsDirectory, name)
    const jsonPath = path.join(flowDirectory, 'build.json')

    if (!fs.existsSync(jsonPath)) {
      return { name, error: 'No report was generated for this flow.' }
    }

    try {
      return { name, report: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) }
    }
    catch (error) {
      console.error(`Could not read ${jsonPath}: ${error.message}`)
      return { name, error: 'The flow report could not be read.' }
    }
  })

  const outputPath = path.join(reportsDirectory, 'index.html')
  fs.writeFileSync(outputPath, renderAggregateReport(flows))
  console.log(`Suite report written to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reportsDirectory = path.resolve(process.argv[2] ?? 'maestro-reports')
  generateAggregateReport(reportsDirectory)
}
