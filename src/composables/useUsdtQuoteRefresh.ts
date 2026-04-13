import type { ComputedRef, Ref } from 'vue'
import type { PolygonTransferQuote, RpcLikeError } from '@/lib/polygon/types'
import type { PolygonTransferQuoteRequest } from '@/stores/polygon-usdt'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { formatUsdtAmount } from '@/lib/assets'
import { usePolygonUsdt } from '@/stores/polygon-usdt'

const QUOTE_REFRESH_INTERVAL_MS = 20_000
const GENERIC_QUOTE_ERROR = 'Could not calculate Polygon fee right now. Please try again.'
const TIMEOUT_QUOTE_ERROR = 'Polygon took too long to calculate the fee. Please try again.'

export function isGenericPolygonQuoteErrorMessage(message?: string | null) {
  return !!message && message.includes(i18n.t(GENERIC_QUOTE_ERROR))
}

function extractRpcMessages(responseBody?: string) {
  if (!responseBody)
    return []

  try {
    const parsed = JSON.parse(responseBody) as unknown
    const items = Array.isArray(parsed) ? parsed : [parsed]

    return items
      .map((item) => {
        if (!item || typeof item !== 'object' || !('error' in item))
          return ''

        const error = (item as { error?: { message?: string } }).error
        return typeof error?.message === 'string' ? error.message : ''
      })
      .filter(Boolean)
  }
  catch {
    return []
  }
}

function isUserFacingQuoteError(message: string) {
  return [
    i18n.t('Invalid amount'),
    i18n.t('Polygon is not ready yet'),
    i18n.t('You don\'t have enough USDT to cover this payment plus Polygon fees.'),
  ].includes(message)
}

function formatPolygonQuoteError(err: unknown) {
  if (!(err instanceof Error))
    return i18n.t(GENERIC_QUOTE_ERROR)

  if (isUserFacingQuoteError(err.message))
    return err.message

  const rpcError = err as RpcLikeError
  const details = [
    err.message,
    rpcError.error?.message,
    rpcError.info?.error?.message,
    String(rpcError.info?.responseStatus || ''),
    ...extractRpcMessages(rpcError.info?.responseBody),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (details.includes('timeout') || details.includes('timed out') || details.includes('408'))
    return i18n.t(TIMEOUT_QUOTE_ERROR)

  return i18n.t(GENERIC_QUOTE_ERROR)
}

interface UseUsdtQuoteRefreshOptions {
  /**
   * When true, automatically refresh + schedule when `request` changes.
   * When false (default), the consumer controls refresh timing via `refresh` + `scheduleRefresh`.
   */
  autoRefresh?: boolean
}

/**
 * Manages USDT transfer quote lifecycle: state, caching, periodic refresh, and cleanup.
 */
export function useUsdtQuoteRefresh(
  request: ComputedRef<PolygonTransferQuoteRequest | null>,
  loading: Ref<boolean>,
  options: UseUsdtQuoteRefreshOptions = {},
) {
  const logger = useLogger('useUsdtQuoteRefresh')
  const polygonUsdt = usePolygonUsdt()

  const quote = ref<PolygonTransferQuote | null>(null)
  const error = ref('')
  const quoteLoading = ref(false)
  let refreshTimer: number | null = null

  function clearRefreshTimer() {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function syncCachedQuote() {
    if (!request.value) {
      quote.value = null
      return
    }

    const cached = polygonUsdt.getCachedTransferQuote(request.value)
    if (cached) {
      quote.value = cached
      error.value = ''
    }
    else if (!quoteLoading.value) {
      quote.value = null
    }
  }

  async function refresh() {
    if (!request.value || loading.value)
      return

    const cached = polygonUsdt.getCachedTransferQuote(request.value)
    if (cached) {
      quote.value = cached
      error.value = ''
    }

    quoteLoading.value = !quote.value
    try {
      quote.value = await polygonUsdt.refreshTransferQuote(
        request.value,
        { previousQuote: quote.value || undefined },
      )
      error.value = ''
    }
    catch (err) {
      if (!cached)
        quote.value = null
      logger.error('Failed to refresh Polygon USDT quote', err)
      error.value = formatPolygonQuoteError(err)
    }
    finally {
      quoteLoading.value = false
    }
  }

  function scheduleRefresh() {
    clearRefreshTimer()
    if (!request.value || loading.value)
      return

    refreshTimer = window.setTimeout(async () => {
      await refresh()
      scheduleRefresh()
    }, QUOTE_REFRESH_INTERVAL_MS)
  }

  /** Reset state when request becomes null. */
  watch(request, (req) => {
    if (!req) {
      quote.value = null
      error.value = ''
      clearRefreshTimer()
    }
  })

  /** Restart the timer when loading toggles (e.g. after payment submission). */
  watch(loading, () => {
    scheduleRefresh()
  })

  if (options.autoRefresh) {
    watch(request, async (req, previousReq) => {
      if (!req)
        return

      syncCachedQuote()

      const shouldRefreshImmediately = !previousReq
        || previousReq.recipient !== req.recipient
        || previousReq.transfer !== req.transfer
        || !quote.value

      if (shouldRefreshImmediately)
        await refresh()

      scheduleRefresh()
    }, { immediate: true })
  }

  /** Basic fee status text: "Calculating fees…" while loading, "incl. {fee} fees" once quoted, or empty. */
  const feeText = computed(() => {
    if (quoteLoading.value && !quote.value)
      return i18n.t('Calculating fees...')
    if (quote.value)
      return i18n.t('incl. {fee} fees', { fee: formatUsdtAmount(quote.value.fee) })
    return ''
  })

  onUnmounted(() => {
    clearRefreshTimer()
  })

  return {
    quote,
    error,
    quoteLoading,
    feeText,
    refresh,
    scheduleRefresh,
  }
}
