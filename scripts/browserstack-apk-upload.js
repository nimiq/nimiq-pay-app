import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { env, exit } from 'node:process'
import path from 'node:path'

const BS_USERNAME = env.BROWSERSTACK_USERNAME
const BS_ACCESS_KEY = env.BROWSERSTACK_ACCESS_KEY

if (!BS_USERNAME || !BS_ACCESS_KEY) {
  console.error('⛔ BrowserStack credentials not found in environment variables')
  exit(1)
}

const apkPath = path.resolve(process.cwd(), 'android/app/build/outputs/apk/release/app-release-unsigned.apk')
const metadataPath = path.resolve(process.cwd(), 'android/app/build/outputs/apk/release/output-metadata.json')

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
if (appId !== 'com.nimiq.pay') {
  console.error(`⚠️ Wrong Android package ID for BrowserStack: ${appId}. Expected com.nimiq.pay`)
  exit(1)
}

console.log(`✅ Verified Android package ID: ${appId}`)
console.log('📤 Uploading APK to BrowserStack...')

try {
  const curlCmd = `curl -u "${BS_USERNAME}:${BS_ACCESS_KEY}" -X POST "https://api-cloud.browserstack.com/app-automate/upload" -F "file=@${apkPath}" -F "custom_id=NimiqPayAndroidApk"`

  console.log(`📦 Uploading ${path.basename(apkPath)}...`)
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