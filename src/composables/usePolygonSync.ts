import { useTimeoutPoll } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { isDev } from '@/lib'
import { Asset } from '@/lib/assets'
import { SQLQuery } from '@/lib/sql-queries'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { usePolygonUsdt } from '@/stores/polygon-usdt'

const POLYGON_POLL_INTERVAL_MS = isDev ? 30_000 : 10_000
const POLYGON_FEE_POLL_INTERVAL_MS = 60_000
const logger = useLogger('polygon-sync')

let initialized = false

async function feePollCallback() {
  const polygonUsdt = usePolygonUsdt()
  const results = await Promise.allSettled([
    polygonUsdt.primeTransferFee(),
  ])

  if (results[0].status === 'rejected')
    logger.error('Failed to prime transfer fee', results[0].reason)
}

async function pollCallback() {
  logger.log('Starting Polygon sync poll')
  const polygonUsdt = usePolygonUsdt()
  try {
    await polygonUsdt.updateBalance()
  }
  catch (error) {
    logger.error('Error updating Polygon USDT balance', error)
  }
  logger.log('Finished Polygon balance update')

  try {
    await polygonUsdt.syncTransactionHistory()
  }
  catch (error) {
    logger.error('Error syncing Polygon transaction history', error)
  }
  logger.log('Finished Polygon transaction history sync pass', { hasLoadedHistory: polygonUsdt.hasLoadedHistory })

  try {
    const { query } = useConn()
    const dbTxs = await query<Array<{ hash: string, status: string, timestamp?: number, asset?: string }>>(SQLQuery.SelectPendingTransactionsByAsset, [Asset.USDT])
    await Promise.all(dbTxs.map(dbTx => polygonUsdt.updateSingleTransaction(dbTx.hash)))
  }
  catch (error) {
    logger.error('Error updating pending USDT transactions', error)
  }
  logger.log('Finished updating pending USDT transactions')
}

const { pause, resume, isActive } = useTimeoutPoll(pollCallback, POLYGON_POLL_INTERVAL_MS, { immediate: false })

export function usePolygonSync() {
  async function init() {
    if (initialized)
      return

    try {
      await usePolygonUsdt().init()
      initialized = true
    }
    catch (error) {
      logger.error('Failed to initialize Polygon USDT client, will retry on next poll', error)
      return
    }

    // Keep fee snapshot warm so it's cached when user starts a payment
    const { pause: pauseFeePoll, resume: resumeFeePoll, isActive: isFeePollActive } = useTimeoutPoll(feePollCallback, POLYGON_FEE_POLL_INTERVAL_MS, { immediate: true })

    const { activeAsset } = storeToRefs(useApp())

    watch(activeAsset, async (newAsset) => {
      if (newAsset === Asset.USDT) {
        await triggerNow()
        if (!isActive.value)
          resume()
        if (!isFeePollActive.value)
          resumeFeePoll()
        return
      }

      if (isActive.value)
        pause()
      if (isFeePollActive.value)
        pauseFeePoll()
    }, { immediate: true })
  }

  async function triggerNow() {
    await pollCallback()
  }

  return {
    init,
    triggerNow,
    pause,
    resume,
  }
}
