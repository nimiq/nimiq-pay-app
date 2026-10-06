import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
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

const args = process.argv.slice(2)
const envFile = path.resolve(process.cwd(), '.env')
loadDotEnv(envFile)

const BS_USERNAME = getArgValue('--username', env.BROWSERSTACK_USERNAME)
const BS_ACCESS_KEY = getArgValue('--access-key', env.BROWSERSTACK_ACCESS_KEY)

function getArgValue(flag, fallback = undefined) {
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

const printHelp = () => {
  console.log(`Usage: node scripts/browserstack-maestro-upload.js [options]

Options:
  --folder <path>        Folder to zip and upload (default: nimiq-pay-tests)
  --custom-id <id>       BrowserStack custom_id for the uploaded suite (default: francisco_tests)
  --zip <path>           Output zip path (default: /tmp/browserstack-maestro-<timestamp>.zip)
  --username <value>     BrowserStack username (or BROWSERSTACK_USERNAME env var)
  --access-key <value>   BrowserStack access key (or BROWSERSTACK_ACCESS_KEY env var)
  --help                 Show this help message
`)
}

if (args.includes('--help')) {
  printHelp()
  exit(0)
}

if (!BS_USERNAME || !BS_ACCESS_KEY) {
  console.error('⛔ BrowserStack credentials not found in environment variables: BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY')
  exit(1)
}

const defaultFolder = path.resolve(process.cwd(), 'nimiq-pay-tests')
const folderPath = path.resolve(process.cwd(), getArgValue('--folder', defaultFolder))
const customId = getArgValue('--custom-id', 'francisco_tests')
const zipPath = path.resolve(process.cwd(), getArgValue('--zip', path.join(os.tmpdir(), `browserstack-maestro-${Date.now()}.zip`)))

if (!fs.existsSync(folderPath)) {
  console.error(`⛔ Folder not found: ${folderPath}`)
  exit(1)
}

if (!fs.existsSync(path.dirname(zipPath))) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true })
}

const zipParent = path.dirname(folderPath)
const zipFolderName = path.basename(folderPath)

console.log(`📦 Zipping ${folderPath} into ${zipPath}...`)

try {
  execSync(`cd "${zipParent}" && zip -r "${zipPath}" "${zipFolderName}" -x "${zipFolderName}/tests_output/*"`, { stdio: 'inherit' })
}
catch (error) {
  console.error('❌ Failed to create zip archive.')
  console.error(error.message)
  exit(1)
}

console.log('📤 Uploading Maestro test suite to BrowserStack...')

const curlCmd = `curl -u "${BS_USERNAME}:${BS_ACCESS_KEY}" -X POST "https://api-cloud.browserstack.com/app-automate/maestro/v2/test-suite" -F "file=@${zipPath}" -F "custom_id=${customId}"`

try {
  const output = execSync(curlCmd, { encoding: 'utf8' })
  console.log(output.trim())
  console.log(`✅ Uploaded test suite zip: ${zipPath}`)
}
catch (error) {
  console.error('❌ Upload failed.')
  if (error.stdout) {
    console.error(String(error.stdout).trim())
  }
  if (error.stderr) {
    console.error(String(error.stderr).trim())
  }
  exit(1)
}
