import fs from 'node:fs'
import path from 'node:path'
import { env, exit } from 'node:process'

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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function printHelp() {
  console.log(`Usage: node scripts/browserstack-maestro-run.js [options]

Options:
  --app <value>            BrowserStack app identifier or custom_id (required)
  --suite <value>          BrowserStack test suite identifier or custom_id (required)
  --device <value>         BrowserStack device string, required, e.g. "Google Pixel 7 Pro-13.0"
  --flow <value>           Flow path inside the uploaded suite to execute (default: flows/francisco_tests/create_new_account_with_pageObject_browserstack.yaml)
  --project <value>        BrowserStack project name (default: Nimiq Pay)
  --format <value>         Maestro report format (default: HTML-DETAILED)
  --output <value>         Maestro report output path (default: nimiq-pay-tests/tests_output/maestro_report.html)
  --username <value>       BrowserStack username (or BROWSERSTACK_USERNAME env var)
  --access-key <value>     BrowserStack access key (or BROWSERSTACK_ACCESS_KEY env var)
  --help                   Show this help message
`)
}

const args = process.argv.slice(2)
if (args.includes('--help')) {
  printHelp()
  exit(0)
}

loadDotEnv(path.resolve(process.cwd(), '.env'))

const BS_USERNAME = getArgValue(args, '--username', env.BROWSERSTACK_USERNAME)
const BS_ACCESS_KEY = getArgValue(args, '--access-key', env.BROWSERSTACK_ACCESS_KEY)
const app = getArgValue(args, '--app', env.BROWSERSTACK_APP_ID)
const suite = getArgValue(args, '--suite', env.BROWSERSTACK_TEST_SUITE_ID)
const device = getArgValue(args, '--device', env.BROWSERSTACK_DEVICE)
const flow = getArgValue(args, '--flow', 'flows/francisco_tests/create_new_account_with_pageObject_browserstack.yaml')
const project = getArgValue(args, '--project', 'Maestro Nimiq Pay')
const format = getArgValue(args, '--format', 'HTML-DETAILED')
const output = getArgValue(args, '--output', 'nimiq-pay-tests/tests_output/maestro_report.html')

if (!BS_USERNAME || !BS_ACCESS_KEY) {
  console.error('⛔ BrowserStack credentials not found. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY or pass --username/--access-key.')
  exit(1)
}

if (!app) {
  console.error('⛔ Missing app identifier. Pass --app or set BROWSERSTACK_APP_ID.')
  exit(1)
}

if (!suite) {
  console.error('⛔ Missing test suite identifier. Pass --suite or set BROWSERSTACK_TEST_SUITE_ID.')
  exit(1)
}

if (!device) {
  console.error('⛔ Missing BrowserStack device. Pass --device "Google Pixel 7 Pro-13.0" or set BROWSERSTACK_DEVICE.')
  exit(1)
}

if (!device.includes('-')) {
  console.error('⛔ BrowserStack device must include OS version in the format "Google Pixel 7 Pro-13.0".')
  exit(1)
}

const payload = {
  app,
  testSuite: suite,
  project,
  devices: [device],
  execute: [flow],
}

const requestBody = JSON.stringify(payload)
const url = 'https://api-cloud.browserstack.com/app-automate/maestro/v2/android/build'

console.log('🚀 Starting BrowserStack Maestro build...')
console.log(`🧾 Maestro report format: ${format}`)
console.log(`📄 Maestro report output: ${output}`)
console.log(JSON.stringify(payload, null, 2))

try {
  const { execFileSync } = await import('node:child_process')
  const output = execFileSync('curl', [
    '-u', `${BS_USERNAME}:${BS_ACCESS_KEY}`,
    '-X', 'POST',
    url,
    '-H', 'Content-Type: application/json',
    '-d', requestBody,
  ], { encoding: 'utf8' })

  console.log(output.trim())
}
catch (error) {
  console.error('❌ BrowserStack build start failed.')
  if (error.stdout) {
    console.error(String(error.stdout).trim())
  }
  if (error.stderr) {
    console.error(String(error.stderr).trim())
  }
  exit(1)
}
