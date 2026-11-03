import { describe, expect, it } from 'vitest'
import { disableOtaUpdates } from './build-test-apk.mjs'

describe('disableOtaUpdates', () => {
  it('turns Capgo auto updates off and keeps the rest of the config', () => {
    const config = {
      appId: 'com.nimiq.pay',
      plugins: {
        CapacitorUpdater: { autoUpdate: 'atBackground', defaultChannel: 'production' },
        SplashScreen: { launchAutoHide: false },
      },
    }

    const patched = disableOtaUpdates(config)

    expect(patched.plugins.CapacitorUpdater).toEqual({ autoUpdate: 'off', defaultChannel: 'production' })
    expect(patched.plugins.SplashScreen).toEqual({ launchAutoHide: false })
    expect(config.plugins.CapacitorUpdater.autoUpdate).toBe('atBackground')
  })

  it('refuses a config without the updater section', () => {
    expect(() => disableOtaUpdates({ plugins: {} })).toThrow(/CapacitorUpdater is missing/)
  })
})
