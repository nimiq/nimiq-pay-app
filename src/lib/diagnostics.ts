import { Device } from '@capacitor/device'
import { useLogger } from '@/composables/useLogger'
import { getBundleVersion } from '@/lib/app-version'
import { useLocks } from '@/stores/locks'
import { useRemoteSigner } from '@/stores/remote-signer'

const logger = useLogger('Diagnostics')

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
