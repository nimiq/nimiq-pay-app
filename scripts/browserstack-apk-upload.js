import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process, { env, exit } from 'node:process'

const RELEASE_APK = 'android/app/build/outputs/apk/release/app-release-unsigned.apk'

// BrowserStack custom_id per package id. The debug build gets its own id so a local upload
// cannot silently replace the APK the BrowserStack CI run depends on.
const CUSTOM_IDS = {
  'com.nimiq.pay': 'NimiqPayAndroidApk',
  'com.nimiq.pay.debug': 'NimiqPayAndroidApkDebug',
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
  console.log(`Usage: node scripts/browserstack-apk-upload.js [options]

Options:
  --apk <path>        APK to upload (default: ${RELEASE_APK})
  --custom-id <id>    BrowserStack custom_id (default: NimiqPayAndroidApk, or
                      NimiqPayAndroidApkDebug for the debug package)
  --help              Show this help message
`)
}

const args = process.argv.slice(2)
if (args.includes('--help')) {
  printHelp()
  exit(0)
}

const BS_USERNAME = env.BROWSERSTACK_USERNAME
const BS_ACCESS_KEY = env.BROWSERSTACK_ACCESS_KEY

if (!BS_USERNAME || !BS_ACCESS_KEY) {
  console.error('⛔ BrowserStack credentials not found in environment variables')
  exit(1)
}

const apkPath = path.resolve(process.cwd(), getArgValue(args, '--apk', RELEASE_APK))
// AGP writes the metadata next to the APK, so the debug variant resolves without extra flags.
const metadataPath = path.join(path.dirname(apkPath), 'output-metadata.json')

if (!fs.existsSync(apkPath)) {
  console.error(`⚠️ File not found: ${apkPath}`)
  exit(1)
}

if (!fs.existsSync(metadataPath)) {
  console.error(`⚠️ APK metadata not found: ${metadataPath}`)
  exit(1)
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
const appId = metadata.applicationId
const defaultCustomId = CUSTOM_IDS[appId]

if (!defaultCustomId) {
  console.error(`⚠️ Wrong Android package ID for BrowserStack: ${appId}. Expected one of ${Object.keys(CUSTOM_IDS).join(', ')}`)
  exit(1)
}

const customId = getArgValue(args, '--custom-id', defaultCustomId)

console.log(`✅ Verified Android package ID: ${appId}`)
if (appId.endsWith('.debug')) {
  console.log('ℹ️ Debug builds install as com.nimiq.pay.debug, so BrowserStack flows pinning com.nimiq.pay will not match this app.')
}
console.log('📤 Uploading APK to BrowserStack...')

try {
  const curlCmd = `curl -u "${BS_USERNAME}:${BS_ACCESS_KEY}" -X POST "https://api-cloud.browserstack.com/app-automate/upload" -F "file=@${apkPath}" -F "custom_id=${customId}"`

  console.log(`📦 Uploading ${path.basename(apkPath)} as custom_id=${customId}...`)
  const output = execSync(curlCmd).toString()

  const response = JSON.parse(output)
  if (response.app_url) {
    console.log(`✅ Successfully uploaded ${path.basename(apkPath)}`)
    console.log(`🔗 App URL: ${response.app_url}`)
    console.log(`🔗 App ID: ${response.shareable_id}`)
  }
  else {
    console.error(`❌ Failed to upload ${path.basename(apkPath)}: ${output}`)
    exit(1)
  }
}
catch (error) {
  console.error(`❌ Error uploading ${path.basename(apkPath)}:`, error.message)
  exit(1)
}
