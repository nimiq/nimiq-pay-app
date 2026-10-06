import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateAggregateReport, renderAggregateReport } from './browserstack-maestro-aggregate-report.js'

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
})
