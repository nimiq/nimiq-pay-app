import { App } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useLogger } from '@/composables/useLogger'

const logger = useLogger('AppVersion')

export async function getBundleVersion() {
  try {
    const version = (await CapacitorUpdater.current()).bundle.version
    // 'builtin' is the bundle shipped in the store build, whose version is the native one
    if (version && version !== 'builtin')
      return version
  }
  catch (e) {
    logger.error('Error getting bundle version:', e)
  }

  try {
    return (await App.getInfo()).version
  }
  catch (e) {
    logger.error('Error getting native version:', e)
    return '0.0.0'
  }
}
