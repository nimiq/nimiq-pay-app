import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useLogger } from '@/composables/useLogger'
import { useLocks } from '@/stores/locks'
import { useRemoteSigner } from '@/stores/remote-signer'

const logger = useLogger('Diagnostics')

export async function getBundleVersion() {
  try {
    const version = (await CapacitorUpdater.current()).bundle.version
    if (version)
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

const LOCKS = [
  'headChangePendingDrainLock',
  'htlcCheckLock',
  'headChangeUpdatesLock',
  'isNetworkReconnecting',
  'isProcessingRemote',
  'isSendingTx',
  'isSyncingWallets',
  'isUpdatingTransactions',
] as const

/** Logs app state useful for support, so exported logs include it */
export async function logDiagnostics() {
  const locks = useLocks()
  logger.log(Object.fromEntries(LOCKS.map(key => [key, locks[key]])))

  const [remoteSigners, deviceInfo, bundleVersion] = await Promise.all([
    useRemoteSigner().getAllRemoteSigners(),
    Device.getInfo(),
    getBundleVersion(),
  ])
  logger.log('Remote signers:', remoteSigners)
  logger.log('Device Info:', deviceInfo)
  logger.log(`Nimiq Pay bundle v${bundleVersion}`)
}
