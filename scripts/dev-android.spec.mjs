import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import { buildArgs, EMULATOR_HOST, listDevices, parseAdbDevices, resolveAdb, shouldUseEmulatorHost } from './dev-android.mjs'

const EMULATOR = { serial: 'emulator-5554', state: 'device' }
const PHONE = { serial: 'R5CT10ABCDE', state: 'device' }
const BASE = ['cap', 'run', 'android', '--livereload', '--external', '--watch']

describe('dev:android host selection', () => {
  it('is wired up as the dev:android script', () => {
    expect(packageJson.scripts['dev:android']).toBe('node scripts/dev-android.mjs')
  })

  it('advertises the emulator NAT alias for the host, not some other address', () => {
    // Pinned literally: every other assertion interpolates EMULATOR_HOST, so without this a typo
    // here would keep the suite green and surface only as "Nimiq Pay could not load".
    expect(EMULATOR_HOST).toBe('10.0.2.2')
  })

  describe('parseAdbDevices', () => {
    it('reads serials and skips the header', () => {
      expect(parseAdbDevices('List of devices attached\nemulator-5554\tdevice\n'))
        .toEqual([EMULATOR])
    })

    it('ignores daemon chatter', () => {
      const stdout = [
        '* daemon not running; starting now at tcp:5037',
        'List of devices attached',
        'emulator-5554\tdevice',
        '',
      ].join('\n')
      expect(parseAdbDevices(stdout)).toEqual([EMULATOR])
    })

    it('keeps targets that are not ready yet, so they still count as attached', () => {
      const stdout = 'List of devices attached\nR5CT10ABCDE\tunauthorized\nemulator-5556\toffline\n'
      expect(parseAdbDevices(stdout)).toEqual([
        { serial: 'R5CT10ABCDE', state: 'unauthorized' },
        { serial: 'emulator-5556', state: 'offline' },
      ])
    })
  })

  describe('buildArgs', () => {
    it('advertises the emulator host when only an emulator is attached', () => {
      expect(buildArgs([EMULATOR])).toEqual([...BASE, `--public-host=${EMULATOR_HOST}`])
    })

    it('advertises the emulator host when nothing is attached yet, since only an emulator can be booted', () => {
      expect(buildArgs([])).toEqual([...BASE, `--public-host=${EMULATOR_HOST}`])
    })

    it('keeps the LAN IP when a physical device is attached', () => {
      expect(buildArgs([PHONE])).toEqual(BASE)
    })

    it('prefers the physical device when both are attached', () => {
      expect(buildArgs([EMULATOR, PHONE])).toEqual(BASE)
    })

    it('keeps the LAN IP for a phone still showing the USB-debugging prompt', () => {
      // Regression guard: filtering on state === 'device' dropped this row, which read as
      // "nothing attached" and forced the emulator host onto real hardware moments later.
      expect(buildArgs([{ serial: 'R5CT10ABCDE', state: 'unauthorized' }])).toEqual(BASE)
    })

    it('keeps Ionic behaviour unchanged when adb could not be consulted', () => {
      expect(buildArgs(null)).toEqual(BASE)
    })

    it('inserts the flag ahead of extra args, so a -- passthrough cannot swallow it', () => {
      expect(buildArgs([EMULATOR], ['--', '--debug']))
        .toEqual([...BASE, `--public-host=${EMULATOR_HOST}`, '--', '--debug'])
    })

    it('forwards extra arguments such as --target', () => {
      expect(buildArgs([EMULATOR], ['--target', 'Pixel_9']))
        .toEqual([...BASE, `--public-host=${EMULATOR_HOST}`, '--target', 'Pixel_9'])
    })
  })

  describe('shouldUseEmulatorHost', () => {
    it('never overrides a host the caller chose', () => {
      for (const args of [
        ['--public-host=192.168.1.60'],
        ['--public-host', '192.168.1.60'],
        ['--host=192.168.1.60'],
        ['--livereload-url=http://192.168.1.60:8100'],
      ])
        expect(shouldUseEmulatorHost([EMULATOR], args)).toBe(false)
    })

    it('trusts an explicit --target over the attached device list', () => {
      // An AVD name is not an adb serial, so a named emulator wins even with a phone plugged in.
      expect(shouldUseEmulatorHost([EMULATOR, PHONE], ['--target', 'Pixel_9'])).toBe(true)
      expect(shouldUseEmulatorHost([EMULATOR, PHONE], ['--target=Pixel_9'])).toBe(true)
      expect(shouldUseEmulatorHost([EMULATOR, PHONE], ['--target', PHONE.serial])).toBe(false)
      expect(shouldUseEmulatorHost([EMULATOR, PHONE], [`--target=${PHONE.serial}`])).toBe(false)
    })
  })

  describe('resolveAdb', () => {
    it('prefers the SDK copy over PATH', () => {
      const adb = resolveAdb({ env: { ANDROID_HOME: '/sdk' }, exists: p => p === '/sdk/platform-tools/adb' })
      expect(adb).toBe('/sdk/platform-tools/adb')
    })

    it('falls through a stale ANDROID_HOME to ANDROID_SDK_ROOT', () => {
      const adb = resolveAdb({
        env: { ANDROID_HOME: '/stale', ANDROID_SDK_ROOT: '/good' },
        exists: p => p === '/good/platform-tools/adb',
      })
      expect(adb).toBe('/good/platform-tools/adb')
    })

    it('falls back to the default SDK location when nothing is exported', () => {
      const adb = resolveAdb({
        env: {},
        home: '/Users/dev',
        exists: p => p === '/Users/dev/Library/Android/sdk/platform-tools/adb',
      })
      expect(adb).toBe('/Users/dev/Library/Android/sdk/platform-tools/adb')
    })

    it('falls back to PATH when no SDK copy exists', () => {
      expect(resolveAdb({ env: {}, home: '/Users/dev', exists: () => false })).toBe('adb')
    })
  })

  describe('listDevices', () => {
    it('returns null rather than guessing when adb is unavailable', () => {
      expect(listDevices({ exec: () => ({ error: new Error('ENOENT') }) })).toBeNull()
      expect(listDevices({ exec: () => ({ status: 1, stdout: '' }) })).toBeNull()
    })

    it('returns null when adb hangs and is killed by the timeout', () => {
      expect(listDevices({ exec: () => ({ status: null, signal: 'SIGTERM', error: new Error('ETIMEDOUT') }) }))
        .toBeNull()
    })

    it('bounds the adb call so a wedged daemon cannot hang the dev command', () => {
      let options
      const exec = (_cmd, _args, opts) => {
        options = opts
        return { status: 0, stdout: '' }
      }
      listDevices({ exec })
      expect(options.timeout).toBeGreaterThan(0)
    })

    it('parses a successful invocation', () => {
      const exec = () => ({ status: 0, stdout: 'List of devices attached\nemulator-5554\tdevice\n' })
      expect(listDevices({ exec })).toEqual([EMULATOR])
    })
  })
})
