import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process, { env, exit } from 'node:process'
import { apkHasOtaDisabled } from './build-test-apk.mjs'

const RELEASE_APK = 'android/app/build/outputs/apk/release/app-release-unsigned.apk'

// BrowserStack custom_id per package id. The debug build gets its own id so a local upload
// cannot silently replace the APK the BrowserStack CI run depends on.
const CUSTOM_IDS = {
  'com.nimiq.pay': 'NimiqPayAndroidApk',
  'com.nimiq.pay.debug': 'NimiqPayAndroidApkDebug',
}

// Repo variable the Maestro suite workflow reads: "<bs:// app url> <commit>", one value so the
// app and the commit it was built from (recorded by scripts/build-test-apk.mjs) change together.
const REPO_VARIABLES = {
  'com.nimiq.pay.debug': 'BROWSERSTACK_ANDROID_DEBUG_APP',
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
  --set-repo-variables  After uploading the debug APK, store its bs:// URL and build commit
                      as GitHub repo variables via \`gh\` (used by the Maestro suite workflow)
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
const setRepoVariable = args.includes('--set-repo-variables')
const repoVariable = REPO_VARIABLES[appId]
let buildCommit

// Checked before uploading, so a refused run costs no upload.
if (setRepoVariable) {
  if (!repoVariable) {
    console.error(`⛔ No repo variable is defined for ${appId}.`)
    exit(1)
  }

  const recordPath = path.join(path.dirname(apkPath), 'build-commit.json')
  const apkSha256 = createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex')
  let otaDisabled = false
  try {
    const buildRecord = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, 'utf8')) : undefined
    // A record left over from an earlier build-test-apk.mjs run must not be credited to this APK.
    buildCommit = buildRecord?.apkSha256 === apkSha256 ? buildRecord.commit : undefined
    otaDisabled = apkHasOtaDisabled(apkPath)
  }
  catch {
    // An unreadable record, or an APK without assets/capacitor.config.json, is refused below.
  }

  // CI only pins builds that cannot self-update to the production web bundle mid-suite.
  if (!otaDisabled || !buildCommit) {
    console.error('⛔ Refusing --set-repo-variables: build this APK with `node scripts/build-test-apk.mjs` (over-the-air updates off, commit recorded).')
    exit(1)
  }
}

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

    if (setRepoVariable) {
      try {
        execSync(`gh variable set ${repoVariable} --body "${response.app_url} ${buildCommit}"`, { stdio: 'inherit' })
      }
      catch {
        console.error(`❌ The upload succeeded, but setting ${repoVariable} failed. Set it to "${response.app_url} ${buildCommit}" by hand.`)
        exit(1)
      }
      console.log(`✅ Repo variable ${repoVariable} updated (built from ${buildCommit})`)
    }
  }
  else {
    console.error(`❌ Failed to upload ${path.basename(apkPath)}: ${output}`)
    exit(1)
  }
}
catch (error) {
  // Not error.message: for a failed execSync it contains the curl command and its credentials.
  console.error(`❌ Error uploading ${path.basename(apkPath)} (exit ${error.status ?? 'unknown'})`)
  if (error.stderr) {
    console.error(String(error.stderr).trim())
  }
  exit(1)
}
