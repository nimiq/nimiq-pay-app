import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkSimulatorApp } from './build-test-ios-sim.mjs'

describe('checkSimulatorApp', () => {
  let directory, appPath, providerBundle

  function writeApp({ autoUpdate = 'off', bridge = 'provider build' } = {}) {
    fs.mkdirSync(path.join(appPath, 'public'), { recursive: true })
    fs.writeFileSync(path.join(appPath, 'capacitor.config.json'), JSON.stringify({ plugins: { CapacitorUpdater: { autoUpdate } } }))
    fs.writeFileSync(path.join(appPath, 'public', 'web3-provider.js'), bridge)
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-sim-app-'))
    appPath = path.join(directory, 'App.app')
    providerBundle = path.join(directory, 'provider.js')
    fs.writeFileSync(providerBundle, 'provider build')
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('accepts an app with updates off and the current bridge', () => {
    writeApp()

    expect(() => checkSimulatorApp(appPath, providerBundle)).not.toThrow()
  })

  it('refuses an app that can still update itself', () => {
    writeApp({ autoUpdate: 'atBackground' })

    expect(() => checkSimulatorApp(appPath, providerBundle)).toThrow(/over-the-air updates enabled/)
  })

  it('refuses a placeholder or stale bridge', () => {
    writeApp({ bridge: '// placeholder' })

    expect(() => checkSimulatorApp(appPath, providerBundle)).toThrow(/pnpm build:web3-provider/)
  })

  it('refuses a bridge when the provider was never built', () => {
    writeApp()
    fs.rmSync(providerBundle)

    expect(() => checkSimulatorApp(appPath, providerBundle)).toThrow(/pnpm build:web3-provider/)
  })
})
