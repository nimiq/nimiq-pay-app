import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const BS_USERNAME = env.BROWSERSTACK_USERNAME
const BS_ACCESS_KEY = env.BROWSERSTACK_ACCESS_KEY

if (!BS_USERNAME || !BS_ACCESS_KEY) {
  console.error('⛔ BrowserStack credentials not found in environment variables')
  exit(1)
}

const version = packageJson.version
const uploadsBasePath = path.join(__dirname, '..')
const androidPath = path.join(uploadsBasePath, 'builds/android')
const iosPath = path.join(uploadsBasePath, 'builds/ios')

const files = [
  {
    path: path.join(androidPath, `NimiqPay-${version}.aab`),
    platform: 'Android',
  },
  {
    path: path.join(iosPath, `NimiqPay-${version}.ipa`),
    platform: 'iOS',
  },
]

console.log('📤 Uploading app builds to BrowserStack...')

files.forEach((file) => {
  if (fs.existsSync(file.path)) {
    try {
      const curlCmd = `curl -u "${BS_USERNAME}:${BS_ACCESS_KEY}" -X POST "https://api-cloud.browserstack.com/app-automate/upload" -F "file=@${file.path}" -F "custom_id=NimiqPay${file.platform}"`

      console.log(`📦 Uploading ${path.basename(file.path)}...`)
      const output = execSync(curlCmd).toString()

      const response = JSON.parse(output)
      if (response.app_url) {
        console.log(`✅ Successfully uploaded ${path.basename(file.path)}`)
        console.log(`🔗 App URL: ${response.app_url}`)
        console.log(`🔗 App ID: ${response.shareable_id}`)
      }
      else {
        console.error(`❌ Failed to upload ${path.basename(file.path)}: ${output}`)
      }
    }
    catch (error) {
      console.error(`❌ Error uploading ${path.basename(file.path)}:`, error.message)
    }
  }
  else {
    console.warn(`⚠️ File not found: ${file.path}`)
  }
})
