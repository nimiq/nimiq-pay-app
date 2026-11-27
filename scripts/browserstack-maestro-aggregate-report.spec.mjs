import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateAggregateReport, renderAggregateReport, renderSlackSummary } from './browserstack-maestro-aggregate-report.js'

const tempDirectories = []

function createTempDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-aggregate-report-'))
  tempDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('renderAggregateReport', () => {
  it('shows every test result and links to its flow report and artifacts', () => {
    const html = renderAggregateReport([{
      name: 'mini_apps_search',
      report: {
        build: { id: 'build-123' },
        sessions: [{
          device: 'Samsung Galaxy Tab S9-13.0',
          testcases: { data: [{ testcases: [{
            name: 'searches mini apps',
            status: 'passed',
            duration: 12,
            video: 'https://example.test/video',
          }] }] },
        }],
      },
    }])

    expect(html).toContain('mini_apps_search')
    expect(html).toContain('searches mini apps')
    expect(html).toContain('passed: <strong>1</strong>')
    expect(html).toContain('mini_apps_search/index.html')
    expect(html).toContain('https://example.test/video')
  })

  it('shows flows that did not produce a report', () => {
    const html = renderAggregateReport([{ name: 'broken_flow', error: 'No report was generated.' }])

    expect(html).toContain('broken_flow')
    expect(html).toContain('Report unavailable')
    expect(html).toContain('unavailable: <strong>1</strong>')
  })

  it('escapes flow and testcase values', () => {
    const html = renderAggregateReport([{
      name: '<script>flow</script>',
      report: {
        sessions: [{
          testcases: { data: [{ testcases: [{ name: '<script>test</script>', status: 'failed' }] }] },
        }],
      },
    }])

    expect(html).not.toContain('<script>flow</script>')
    expect(html).not.toContain('<script>test</script>')
    expect(html).toContain('&lt;script&gt;flow&lt;/script&gt;')
    expect(html).toContain('&lt;script&gt;test&lt;/script&gt;')
  })
})

describe('outcomes', () => {
  const intermittent = {
    name: 'top_up_flow',
    result: {
      outcome: 'INTERMITTENT',
      ok: false,
      attempts: [
        { diagnosis: 'UNKNOWN', signal: '', failingStep: 'Assert that "Top Up" is visible' },
        { diagnosis: 'PASSED', signal: '', failingStep: null },
      ],
    },
    report: { build: { id: 'b2', status: 'passed' }, sessions: [{ testcases: { data: [{ testcases: [{ name: 'top_up_flow', status: 'passed' }] }] } }] },
  }
  const retried = {
    name: 'recovery_words_banner',
    result: { outcome: 'PASSED_ON_RETRY', ok: true, attempts: [{ diagnosis: 'INFRA', signal: 'BrowserStack could not start the session' }, { diagnosis: 'PASSED', signal: '' }] },
  }
  const passed = { name: 'about', result: { outcome: 'PASSED', ok: true, attempts: [{ diagnosis: 'PASSED', signal: '' }] } }

  it('never shows a flow that only passed its diagnostic rerun as passed', () => {
    const html = renderAggregateReport([intermittent])

    expect(html).toContain('intermittent (needs human)')
    expect(html).toContain('badge failed')
    expect(html).toContain('2 attempts')
  })

  it('summarises every non-passing flow for Slack, including infra retries', () => {
    const summary = renderSlackSummary([passed, intermittent, retried])

    expect(summary.split('\n')[0]).toBe('3 flows: 1 passed · 1 intermittent (needs human) · 1 passed on infra retry')
    expect(summary).toContain('• top_up_flow: intermittent (needs human) at Assert that "Top Up" is visible')
    expect(summary).toContain('• recovery_words_banner: passed on infra retry (BrowserStack could not start the session)')
    expect(summary).not.toContain('• about')
  })

  it('marks quarantined flows as non-blocking', () => {
    const summary = renderSlackSummary([{ name: 'new_flow', result: { outcome: 'UNKNOWN', ok: false, quarantine: true, attempts: [] } }])

    expect(summary).toContain('• new_flow [quarantine, non-blocking]: unclassified')
    expect(renderAggregateReport([{ name: 'new_flow', result: { outcome: 'UNKNOWN', ok: false, quarantine: true, attempts: [] } }])).toContain('quarantine</span>')
  })

  it('escapes Slack control characters', () => {
    const summary = renderSlackSummary([{ name: '<!channel>', result: { outcome: 'UNKNOWN', ok: false, attempts: [] } }])

    expect(summary).toContain('&lt;!channel&gt;')
  })
})

describe('generateAggregateReport', () => {
  it('creates the suite index, including expected flow directories without reports', () => {
    const reportsDirectory = createTempDirectory()
    const flowDirectory = path.join(reportsDirectory, 'known_flow')
    fs.mkdirSync(flowDirectory)
    fs.mkdirSync(path.join(reportsDirectory, 'missing_flow'))
    fs.writeFileSync(path.join(flowDirectory, 'build.json'), JSON.stringify({
      build: { status: 'passed' },
      sessions: [{ testcases: { data: [{ testcases: [{ name: 'test', status: 'passed' }] }] } }],
    }))

    generateAggregateReport(reportsDirectory)

    const html = fs.readFileSync(path.join(reportsDirectory, 'index.html'), 'utf8')
    expect(html).toContain('known_flow')
    expect(html).toContain('missing_flow')
    expect(html).toContain('test')
    expect(html).toContain('Report unavailable')
  })

  it('reports flows the suite skipped and writes the Slack summary', () => {
    const reportsDirectory = createTempDirectory()
    fs.mkdirSync(path.join(reportsDirectory, 'skipped_flow'))
    fs.writeFileSync(path.join(reportsDirectory, 'skipped_flow', 'result.json'), JSON.stringify({
      flow: 'flows/francisco_tests/skipped_flow.yaml',
      outcome: 'NOT_RUN',
      ok: false,
      signal: 'Skipped: wall-clock budget exhausted',
      attempts: [],
    }))

    generateAggregateReport(reportsDirectory)

    expect(fs.readFileSync(path.join(reportsDirectory, 'index.html'), 'utf8')).toContain('Skipped: wall-clock budget exhausted')
    expect(fs.readFileSync(path.join(reportsDirectory, 'slack-summary.txt'), 'utf8')).toContain('• skipped_flow: not run (Skipped: wall-clock budget exhausted)')
  })
})
