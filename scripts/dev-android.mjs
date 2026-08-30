#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Live reload on Android, picking the right host for the target.
 *
 * `--external` binds Vite to 0.0.0.0 and makes Ionic advertise this machine's LAN IP as the URL
 * the webview loads. That is correct for a physical phone on the same Wi-Fi, but an emulator is
 * not on the LAN at all: it sits behind a virtual NAT where 10.0.2.2 is the alias for the host.
 * The LAN IP is frequently unreachable from inside it (a host firewall is enough to block it), and
 * when the load fails Capacitor silently substitutes public/error.html — "Nimiq Pay could not
 * load" — which looks like an app bug rather than a networking one.
 */
export const EMULATOR_HOST = '10.0.2.2'

const BASE_ARGS = ['cap', 'run', 'android', '--livereload', '--external', '--watch']

/**
 * Flags through which the caller decides the webview URL themselves. `--host` and
 * `--livereload-url` both bypass the branch Ionic reads `--public-host` from
 * (@ionic/cli lib/serve.js:99,191-197), so appending our own would be dead argv.
 */
const HOST_FLAGS = ['--public-host', '--host', '--livereload-url']

const ADB_TIMEOUT_MS = 5000

function isEmulatorSerial(serial) {
  return serial.startsWith('emulator-')
}

function isHostFlag(arg) {
  return HOST_FLAGS.some(flag => arg === flag || arg.startsWith(`${flag}=`))
}

function readTarget(extraArgs) {
  const index = extraArgs.findIndex(arg => arg === '--target' || arg.startsWith('--target='))
  if (index === -1)
    return undefined
  const arg = extraArgs[index]
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : extraArgs[index + 1]
}

/**
 * Every row `adb devices` printed, including ones that are not ready yet. Readiness is
 * deliberately not filtered: a phone still showing the "Allow USB debugging?" prompt reports
 * `unauthorized`, and dropping it would look like "nothing attached" and send the emulator host
 * to real hardware a second later.
 */
export function parseAdbDevices(stdout) {
  return stdout
    .split('\n')
    .map(line => line.trim())
    // Drop by content, not position: the daemon's "* daemon not running" chatter is printed
    // before the header, so slicing a fixed number of lines leaves the header behind as a device.
    .filter(line => line && !line.startsWith('*') && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return { serial, state }
    })
}

/**
 * `devices` is null when adb could not be consulted — then we keep Ionic's stock behaviour rather
 * than guess, since guessing wrong breaks physical-device live reload.
 *
 * With no `--target`, no attached hardware means the run can only land on an emulator, whether one
 * is booted already or Ionic boots it. With a `--target`, trust it over the device list: Ionic
 * dispatches on that name, and an AVD name (`Pixel_9`) never looks like an adb serial.
 */
export function shouldUseEmulatorHost(devices, extraArgs = []) {
  if (devices === null || extraArgs.some(isHostFlag))
    return false

  const physical = devices.filter(device => !isEmulatorSerial(device.serial))
  const target = readTarget(extraArgs)
  return target === undefined
    ? physical.length === 0
    : !physical.some(device => device.serial === target)
}

export function buildArgs(devices, extraArgs = []) {
  // Ahead of extraArgs: everything after a `--` separator is forwarded to Vite, not read by Ionic.
  return shouldUseEmulatorHost(devices, extraArgs)
    ? [...BASE_ARGS, `--public-host=${EMULATOR_HOST}`, ...extraArgs]
    : [...BASE_ARGS, ...extraArgs]
}

export function resolveAdb({ env = process.env, exists = existsSync, home = homedir() } = {}) {
  const roots = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(home, 'Android', 'Sdk'),
  ]
  for (const root of roots) {
    if (!root)
      continue
    const candidate = path.join(root, 'platform-tools', 'adb')
    if (exists(candidate))
      return candidate
  }
  return 'adb' // fall back to PATH
}

export function listDevices({ exec = spawnSync } = {}) {
  // `adb devices` is also what cold-starts the adb server, and a wedged one never returns; without
  // a timeout this would hang before a single line of output was printed.
  const result = exec(resolveAdb(), ['devices'], { encoding: 'utf8', timeout: ADB_TIMEOUT_MS })
  if (result.error || result.status !== 0)
    return null
  return parseAdbDevices(result.stdout ?? '')
}

function main() {
  const devices = listDevices()
  const extraArgs = process.argv.slice(2)
  const args = buildArgs(devices, extraArgs)

  if (devices === null)
    console.error(`⚠️  Could not run \`adb devices\`. If you are targeting an emulator and see "Nimiq Pay could not load", re-run with --public-host=${EMULATOR_HOST}`)
  else if (shouldUseEmulatorHost(devices, extraArgs))
    console.error(`📱 Emulator target — advertising ${EMULATOR_HOST} so it can reach the dev server.`)

  console.error(`$ ionic ${args.join(' ')}\n`)

  // Resolve the local bin so `node scripts/dev-android.mjs` works outside a pnpm script, where
  // node_modules/.bin is not on PATH.
  const localIonic = fileURLToPath(new URL('../node_modules/.bin/ionic', import.meta.url))
  return spawn(existsSync(localIonic) ? localIonic : 'ionic', args, { stdio: 'inherit' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = main()

  // Ionic cleans up on SIGINT/SIGTERM/SIGHUP (resets the injected server.url, kills the Vite
  // server). Ctrl-C reaches it via the shared process group, but an explicit signal to this
  // wrapper would not — forward it so the cleanup still runs.
  for (const signal of ['SIGTERM', 'SIGHUP'])
    process.on(signal, () => child.kill(signal))

  child.on('error', (error) => {
    console.error(`Could not start ionic: ${error.message}`)
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    process.exitCode = signal ? 1 : code ?? 1
  })
}
