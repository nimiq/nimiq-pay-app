import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process, { env } from 'node:process'
import { fileURLToPath } from 'node:url'

const GENERATED_CONFIG = 'android/app/src/main/assets/capacitor.config.json'
const DEBUG_APK = 'android/app/build/outputs/apk/debug/app-debug.apk'

/**
 * Switch off Capgo over-the-air updates in the config `cap sync` generated. The updater resolves
 * the production channel from `appId: com.nimiq.pay`, so with updates on, a relaunch mid-suite
 * could swap in the production web bundle and the run would no longer test this build.
 */
export function disableOtaUpdates(config) {
  const updater = config?.plugins?.CapacitorUpdater
  if (!updater) {
    throw new Error('plugins.CapacitorUpdater is missing from the generated Capacitor config; refusing to build a test APK that may self-update.')
  }

  return { ...config, plugins: { ...config.plugins, CapacitorUpdater: { ...updater, autoUpdate: 'off' } } }
}

/** Whether the packaged APK ships with over-the-air updates off; the upload gate uses it too. */
export function apkHasOtaDisabled(apkPath) {
  const packaged = JSON.parse(execSync(`unzip -p "${apkPath}" assets/capacitor.config.json`, { encoding: 'utf8' }))
  return packaged.plugins?.CapacitorUpdater?.autoUpdate === 'off'
}

function run(command, options = {}) {
  console.log(`▶ ${command}`)
  execSync(command, { stdio: 'inherit', ...options })
}

function main() {
  // Before building: `pnpm build:web` rewrites src/i18n/en.po, which would mark every build dirty.
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''

  // Mini Apps flows are part of the suite, so the test build always ships them.
  run('pnpm build:web', { env: { ...env, VITE_ENABLE_MINI_APPS: 'true' } })
  run('pnpm exec cap sync android')

  const config = JSON.parse(fs.readFileSync(GENERATED_CONFIG, 'utf8'))
  fs.writeFileSync(GENERATED_CONFIG, `${JSON.stringify(disableOtaUpdates(config), null, 2)}\n`)
  console.log(`🔒 Over-the-air updates disabled in ${GENERATED_CONFIG}`)

  run('./gradlew assembleDebug', { cwd: 'android' })

  // Check the packaged APK, not just the source file: the patch only counts if it shipped.
  if (!apkHasOtaDisabled(DEBUG_APK)) {
    throw new Error(`${DEBUG_APK} still has over-the-air updates enabled.`)
  }

  // The APK hash lets the upload script reject this record for an APK built some other way.
  const apkSha256 = createHash('sha256').update(fs.readFileSync(DEBUG_APK)).digest('hex')
  fs.writeFileSync(path.join(path.dirname(DEBUG_APK), 'build-commit.json'), `${JSON.stringify({ commit: `${commit}${dirty ? '-dirty' : ''}`, apkSha256 }, null, 2)}\n`)

  console.log(`✅ ${DEBUG_APK} built from ${commit}${dirty ? ' (with uncommitted changes)' : ''}, over-the-air updates off`)
  console.log('   Upload it with: node scripts/browserstack-apk-upload.js --apk android/app/build/outputs/apk/debug/app-debug.apk --set-repo-variables')
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
