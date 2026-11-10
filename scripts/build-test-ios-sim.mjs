import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process, { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import { disableOtaUpdates, run } from './build-test-apk.mjs'

const GENERATED_CONFIG = 'ios/App/App/capacitor.config.json'
const DERIVED_DATA = 'ios/DerivedData'
const SIMULATOR_APP = `${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/App.app`
const PROVIDER_BUNDLE = 'web3-provider/dist/provider.js'
const PO_FILE = 'src/i18n/en.po'
const PODFILE_LOCK = 'ios/App/Podfile.lock'
const COCOAPODS_LINE = /^COCOAPODS: .*$/m

/**
 * Refuse a simulator app the suite can't trust: over-the-air updates on, or a Mini Apps bridge
 * that isn't the current provider build (without it, `vite build` still succeeds and ships a
 * placeholder or a stale copy).
 */
export function checkSimulatorApp(appPath, providerBundle) {
  const config = JSON.parse(fs.readFileSync(path.join(appPath, 'capacitor.config.json'), 'utf8'))
  if (config.plugins?.CapacitorUpdater?.autoUpdate !== 'off') {
    throw new Error(`${appPath} still has over-the-air updates enabled.`)
  }

  const shippedBridge = path.join(appPath, 'public', 'web3-provider.js')
  if (!fs.existsSync(providerBundle) || !fs.existsSync(shippedBridge) || !fs.readFileSync(shippedBridge).equals(fs.readFileSync(providerBundle))) {
    throw new Error(`${shippedBridge} is not ${providerBundle}; run \`pnpm build:web3-provider\` and build again.`)
  }
}

function changedFiles() {
  return execSync('git diff --name-only HEAD', { encoding: 'utf8' }).split('\n').filter(Boolean)
}

function main() {
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
  const changedBefore = new Set(changedFiles())
  // Only these two rewrites are put back. Anything else the build changes (e.g. `cap sync`
  // updating the Podfile and pods after a plugin change) may need committing, so it is only listed.
  const poBefore = fs.readFileSync(PO_FILE)
  const cocoapodsLineBefore = fs.readFileSync(PODFILE_LOCK, 'utf8').match(COCOAPODS_LINE)[0]

  try {
    // Mini Apps flows are part of the suite, so the test build always ships them.
    run('pnpm build:web', { env: { ...env, VITE_ENABLE_MINI_APPS: 'true' } })
    // Plain `pod install`: with the repo's Gemfile, Capacitor runs `bundle exec pod install`, which
    // fails while the Gemfile.lock gems aren't installed (its `bundle` probe can first spin for minutes).
    run('pnpm exec cap sync ios', { env: { ...env, CAPACITOR_COCOAPODS_PATH: 'pod' } })

    const config = JSON.parse(fs.readFileSync(GENERATED_CONFIG, 'utf8'))
    fs.writeFileSync(GENERATED_CONFIG, `${JSON.stringify(disableOtaUpdates(config), null, 2)}\n`)
    console.log(`🔒 Over-the-air updates disabled in ${GENERATED_CONFIG}`)

    // Ad hoc signing needs no Apple account. Never CODE_SIGNING_ALLOWED=NO: the app then lacks
    // `application-identifier`, every Keychain call fails and onboarding shows a decryption error.
    run(`xcodebuild -quiet -workspace ios/App/App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath ${DERIVED_DATA} CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- PROVISIONING_PROFILE_SPECIFIER= build`)

    // Check the built app, not just the source files: the patch and the bridge only count if they shipped.
    checkSimulatorApp(SIMULATOR_APP, PROVIDER_BUNDLE)
  }
  finally {
    // `pnpm build:web` regenerates en.po, and a newer local CocoaPods writes its version into Podfile.lock.
    fs.writeFileSync(PO_FILE, poBefore)
    fs.writeFileSync(PODFILE_LOCK, fs.readFileSync(PODFILE_LOCK, 'utf8').replace(COCOAPODS_LINE, cocoapodsLineBefore))

    const changedWhileBuilding = changedFiles().filter(file => !changedBefore.has(file))
    if (changedWhileBuilding.length > 0) {
      console.warn(`⚠️ Changed while building (build output or your own edits; review before committing): ${changedWhileBuilding.join(', ')}`)
    }
  }

  console.log(`✅ ${SIMULATOR_APP} built from ${commit}${dirty ? ' (with uncommitted changes)' : ''}, over-the-air updates off`)
  console.log(`   Install it on a booted simulator: xcrun simctl install booted ${SIMULATOR_APP}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  }
  catch (error) {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  }
}
