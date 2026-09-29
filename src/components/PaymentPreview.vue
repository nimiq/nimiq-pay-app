<script setup lang="ts">
import type { PropType } from 'vue'
import type { PaymentRequestData, State } from '@/lib/flows/steps.types'
import { Browser } from '@capacitor/browser'
import { IonButton, IonToggle } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'
import { computed, effectScope, onUnmounted, ref, toValue, watch, watchEffect } from 'vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useCurrencyPriceApi } from '@/composables/useApi'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
// TODO: async import
import { useToast } from '@/composables/useToast'
import { isGenericPolygonQuoteErrorMessage, useUsdtQuoteRefresh } from '@/composables/useUsdtQuoteRefresh'
import { buildPaymentAnalyticsProps, startPaymentAnalytics, trackPaymentStarted } from '@/lib/analytics'
import { Asset, assetToCrypto, fastspotFeeTickerToCrypto, formatUsdtAmount } from '@/lib/assets'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { roundUpToTwoDecimals } from '@/lib/utils'
import { Fiat, useApp } from '@/stores/app'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useLocalWallet } from '@/stores/local-wallet'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { isPaymentTransferType, PaymentMethod, Rail, Transfer } from '@/types/transactions'
import InfoIcon from './icons/info.vue'
import LoadingSpinner from './icons/loading-spinner.vue'
import PolygonWarning from './PolygonWarning.vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  isConfirmationAlert: { type: Boolean },
})

const emit = defineEmits(stepEmits)

const logger = useLogger('PaymentPreview')
const { getPriceNow } = useCurrencyPriceApi()

const polygonUsdt = usePolygonUsdt()
const { isHtlcActive, isRemoteOk } = storeToRefs(useRemoteSigner())
const { balance: usdtBalance, consensus: polygonConsensus } = storeToRefs(polygonUsdt)
const { formatFiat, formatCrypto } = useCurrencyFormatter()
const { localAddress } = storeToRefs(useLocalWallet())
const { selectedFiat } = storeToRefs(useApp())
const { isUsdtMaintenanceActive, usdtMaintenanceNotice } = storeToRefs(useFeatureFlags())

const payment = computed<PaymentRequestData>(() =>
  typeof props.state[StepName.QRCodeScanner] === 'object'
    ? props.state[StepName.QRCodeScanner]
    : typeof props.state[StepName.HoldNakaCardToReader] === 'object'
      ? props.state[StepName.HoldNakaCardToReader].request
      : { amount: 0, fee: 0, recipient: '', transfer: Transfer.UserPayment },
)
const asset = computed(() => payment.value.asset || Asset.NIM)
const isAtomicSwap = computed(() => !!payment.value.swap)
const isNimiqAsset = computed(() => asset.value === Asset.NIM)
const cryptoCurrency = computed(() => assetToCrypto(asset.value))
const loading = ref(false)

// Non-included USDT fees from Fastspot quote (e.g. Polygon HTLC gas)
const nonIncludedUsdtFee = computed(() => {
  if (!payment.value.swap?.fees)
    return 0
  return payment.value.swap.fees
    .filter(f => !f.included && f.asset === 'USDT')
    .reduce((sum, f) => sum + f.amount, 0)
})

const currentUsdtQuoteRequest = computed(() => {
  if (
    asset.value !== Asset.USDT
    || isAtomicSwap.value
    || polygonConsensus.value !== 'established'
    || payment.value.amount <= 0
    || !payment.value.recipient
    || !isPaymentTransferType(payment.value.transfer)
  ) {
    return null
  }

  return {
    amount: payment.value.amount,
    recipient: payment.value.recipient,
    transfer: payment.value.transfer,
  }
})

const {
  quote: usdtQuote,
  error: usdtQuoteError,
  quoteLoading: usdtQuoteLoading,
  feeText: usdtFeeText,
} = useUsdtQuoteRefresh(currentUsdtQuoteRequest, loading, { autoRefresh: true })

// Use VueUse's built-in evaluating ref to track loading state — setting a
// reactive ref synchronously before the first `await` inside computedAsync
// can prevent the async chain from settling in Vue's scheduler.
const loadingHtlcFee = ref(false)
const htlcFeeSnapshot = computedAsync(async () => {
  if (asset.value !== Asset.USDT || !isAtomicSwap.value || polygonConsensus.value !== 'established')
    return null

  try {
    return await polygonUsdt.primeHtlcFee()
  }
  catch (error) {
    logger.error('Failed to get Polygon HTLC fee', error)
    return null
  }
}, null, loadingHtlcFee)

const flowErrorMessage = computed(() => {
  if (usdtQuoteError.value && isGenericPolygonQuoteErrorMessage(props.errorMsg))
    return usdtQuoteError.value

  return props.errorMsg || ''
})

const usdtFee = computed(() => {
  if (asset.value !== Asset.USDT)
    return payment.value.fee

  // For atomic swaps, use non-included fees from Fastspot quote (Polygon HTLC gas),
  // falling back to our local estimate
  return isAtomicSwap.value
    ? (nonIncludedUsdtFee.value || htlcFeeSnapshot.value?.fee || 0)
    : (usdtQuote.value?.fee ?? payment.value.fee)
})

const usdtTotalDebit = computed(() => {
  if (asset.value !== Asset.USDT)
    return payment.value.amount + payment.value.fee

  return payment.value.amount + usdtFee.value
})

const hasEnoughBalance = computed(() => {
  if (props.isConfirmationAlert)
    return true
  if (asset.value === Asset.USDT) {
    if (isAtomicSwap.value)
      return !loadingHtlcFee.value && usdtBalance.value >= usdtTotalDebit.value
    return !!usdtQuote.value && usdtBalance.value >= usdtQuote.value.totalDebit
  }
  return useRemoteSigner().remoteBalance >= payment.value.amount
})

const amounts = computedAsync(async () => {
  // Prefer fiat values that came with the request, and only calculate the missing parts.
  // This allows dev mocks to provide a fee label while still deriving the main fiat amount from live pricing.
  const { fiatAmount, fiatFeeAmount, fiatCurrency } = payment.value
  const missingFiatAmount = fiatAmount === undefined
  const missingFiatFeeAmount = fiatFeeAmount === undefined
  const missingFiatCurrency = fiatCurrency === undefined
  const hasRequestFee = payment.value.fee > 0

  if (!missingFiatAmount && !missingFiatFeeAmount && !missingFiatCurrency) {
    return {
      fiatAmount,
      fiatFeeAmount,
      fiatCurrency,
    }
  }

  const { usePrice } = await import('@/composables/usePrice')
  const useProvidedCurrency = fiatCurrency ? { fiatCurrency: fiatCurrency as any } : {}
  const amountPrice = missingFiatAmount || missingFiatCurrency
    ? usePrice(payment.value.amount, { cryptoCurrency, ...useProvidedCurrency })
    : null
  const feePrice = missingFiatFeeAmount && hasRequestFee
    ? usePrice(payment.value.fee, { cryptoCurrency, ...useProvidedCurrency })
    : null

  await Promise.all([
    amountPrice?.getFiatPrice(),
    feePrice?.getFiatPrice(),
  ])

  return {
    fiatAmount: fiatAmount ?? amountPrice?.fiat.total,
    fiatFeeAmount: fiatFeeAmount ?? feePrice?.fiat.total,
    fiatCurrency: fiatCurrency ?? amountPrice?.fiat.currency ?? feePrice?.fiat.currency,
  }
})

async function convertSwapFeesToFiat(filter: (fee: { asset: string, amount: number, included: boolean, source: string }) => boolean) {
  const fees = payment.value.swap?.fees
  if (!fees)
    return null

  const { usePrice } = await import('@/composables/usePrice')
  let total = 0
  for (const fee of fees) {
    if (!filter(fee))
      continue
    if (fee.asset === Fiat.USD) {
      if (selectedFiat.value === Fiat.USD) {
        total += fee.amount
        continue
      }

      const { data } = await getPriceNow({ currency: selectedFiat.value })
      if (!data?.price) {
        logger.error('Failed to convert Lightning swap USD fee', { fee, selectedFiat: selectedFiat.value })
        return null
      }

      total += fee.amount * data.price
      continue
    }

    const cryptoAsset = fastspotFeeTickerToCrypto(fee.asset)
    if (!cryptoAsset) {
      logger.error('Unsupported Lightning swap fee asset in preview', { asset: fee.asset })
      continue
    }

    const fiatAmount = usePrice(fee.amount, {
      cryptoCurrency: cryptoAsset,
      reactiveToNetwork: false,
    })
    await fiatAmount.getFiatPrice()
    total += fiatAmount.fiat.total
  }
  return total
}

// Network fees: all NETWORK-source fees (blockchain costs for BTC, Polygon, etc.)
const swapNetworkFee = computedAsync(() => convertSwapFeesToFiat(f => f.source === 'NETWORK'), null)

// Service/swap fee: computed from percentage like the wallet does:
// (fromAmount - fromServiceNetworkFee) * serviceFeePercentage, then convert to fiat
const swapServiceFee = computedAsync(async () => {
  const fees = payment.value.swap?.fees
  if (!fees)
    return null

  const serviceFee = fees.find(f => f.source === 'SERVICE' && f.percentage)
  if (!serviceFee?.percentage)
    return null

  // Sum included NETWORK fees in the sell asset to get fromServiceNetworkFee
  const includedNetworkFeeInSellAsset = fees
    .filter(f => f.source === 'NETWORK' && f.included && f.asset === asset.value)
    .reduce((sum, f) => sum + f.amount, 0)

  // Wallet formula: (fromAmount - fromServiceNetworkFee) * serviceFeePercentage
  const feeAmount = (payment.value.amount - includedNetworkFeeInSellAsset) * serviceFee.percentage

  if (feeAmount <= 0)
    return 0

  const { usePrice } = await import('@/composables/usePrice')
  const fiatAmount = usePrice(Math.round(feeAmount), {
    cryptoCurrency,
    reactiveToNetwork: false,
  })
  await fiatAmount.getFiatPrice()
  return fiatAmount.fiat.total
}, null)

// Combined swap fee (for inline text and NIM swaps)
const swapFee = computed(() => {
  if (swapNetworkFee.value === null && swapServiceFee.value === null)
    return null
  return (swapNetworkFee.value ?? 0) + (swapServiceFee.value ?? 0)
})

// Rounded total for display (avoids duplicating the expression in the template)
const roundedSwapFeeTotal = computed(() =>
  roundUpToTwoDecimals(swapNetworkFee.value ?? 0) + roundUpToTwoDecimals(swapServiceFee.value ?? 0),
)

const { hasCashback, message: pointsMessage, pointsState, checkPointsPaymentValidity, isEligible }
  = usePointsPayment({ amount: payment.value.amount, rail: payment.value.rail, recipient: payment.value.recipient, reference: payment.value.paymentRef })

const goCryptoError = ref<string>()
const goCryptoIsAboutToExpire = ref<boolean>()
const unwatchGoCryptoRail = watch(() => payment.value.rail === Rail.GoCrypto, async (isGoCrypto) => {
  // Watch payment rail for whether it's a GoCrypto payment and if that's the case, lazy load and setup GoCrypto
  // monitoring. As soon as we load it and set it up, the rail watcher can be stopped, as the monitoring itself will
  // observe the payment ref and its rail for further changes.
  if (!isGoCrypto)
    return
  window.setTimeout(unwatchGoCryptoRail, 0) // run after watcher invocation
  // Have to create and dispose an effect scope manually as watchers/effects are not used synchronously in setup script.
  // Could also stop monitoring manually, instead of defining a scope, but the scope already handles automatically not
  // executing the run handler when it's already stopped, i.e. when the component has already been unmounted before the
  // async code continues.
  const scope = effectScope()
  // Note that we stop the monitoring only on unmount and not on step visibility change. This way, the monitoring also
  // stays active throughout the following steps, for example PinInput, until the PaymentPreview step is unmounted, e.g.
  // by the flow being dismissed or going back to a step before the PaymentPreview step.
  onUnmounted(() => scope.stop())
  const { useGoCryptoMonitoring } = await import('@/composables/useGoCryptoMonitoring')
  scope.run(() => {
    // Note that we ignore potential updates of the payment request data, and only monitor for errors, as GoCrypto
    // continues to accept payments for the original payment info.
    const { error, remainingTimeExpiryEarly, remainingTimeExpiryFinal } = useGoCryptoMonitoring(payment)
    watchEffect(() => {
      goCryptoError.value = error.value
      goCryptoIsAboutToExpire.value = !remainingTimeExpiryEarly.value && !!remainingTimeExpiryFinal.value
    })
  })
}, { immediate: true })

const objectHasData = (obj?: unknown) => typeof obj === 'object' && Object.keys(obj as Record<string, unknown>).length > 0
// Only show the toggle if he scanned QR code
const canPayWithPuntos = computed(() => asset.value === Asset.NIM && objectHasData(props.state[StepName.QRCodeScanner]))
/**
 * Only allow paying with Points if:
 *   - The user has enough NIM balance
 *   - The user is eligible for Points
 *   - The user has scanned something with the QR code scanner in previous steps (no Naka, no bluecode...)
 */
const payWithPuntos = ref((asset.value === Asset.NIM) && (!hasEnoughBalance.value && isEligible.value && canPayWithPuntos.value))

const paymentMethod = computed(() => {
  if (payWithPuntos.value)
    return PaymentMethod.Points
  else if (asset.value === Asset.USDT)
    return PaymentMethod.USDT
  else if (props.state[StepName.HoldNakaCardToReader])
    return PaymentMethod.NakaCard
  else if (props.state[StepName.QRCodeScanner])
    return PaymentMethod.NIM
  // else if (props.state[StepName.BluecodePayment])
  //   return PaymentMethod.Bluecode
  throw new Error('Unexpected payment method')
})

const loadingSwapLimits = ref(false)
const swapAddressLimits = computedAsync(async () => {
  if (!isAtomicSwap.value)
    return null

  // https://github.com/nimiq/wallet/blob/1102b802030833d5d84d9c304baa85331ba51362/src/composables/useSwapLimits.ts#L252
  const { getLimits, SwapAsset } = await useFastspotApiV1()
  try {
    if (asset.value === Asset.USDT) {
      const { data: ethAddress } = useLocalWallet().getEthAddress()
      if (!ethAddress)
        return null
      return await getLimits(SwapAsset.USDT_MATIC, ethAddress, ethAddress)
    }
    return await getLimits(SwapAsset.NIM, localAddress.value.toUserFriendlyAddress(), localAddress.value.toHex())
  }
  catch (error) {
    logger.error('Failed to get swap limits', error)
    return null
  }
}, null, loadingSwapLimits)

// Buffer 1% of the swap limit to avoid slippage
const swapLimit = computed(() => swapAddressLimits.value ? Math.floor(swapAddressLimits.value.current * 0.99) : 0)
const remainingFiatLimits = computedAsync(async () => {
  // Don't need to do extra computation if the payment is not atomic swap or the swap is not over the limit
  if (!isAtomicSwap.value || payment.value.amount <= swapLimit.value)
    return

  const { usePrice } = await import('@/composables/usePrice')
  const fiatAmount = usePrice(swapLimit.value, { cryptoCurrency })
  await fiatAmount.getFiatPrice()
  return fiatAmount.fiat.formatted
})

const isUsdtMaintenanceBlocked = computed(() => asset.value === Asset.USDT && isUsdtMaintenanceActive.value)

const disabled = computed(() =>
  isUsdtMaintenanceBlocked.value
  || (isAtomicSwap.value && (loadingSwapLimits.value || loadingHtlcFee.value)) /* Not loaded yet */
  // If failed to get limits, allow payment cause in case of being over the limit, it will fail when confirming swap
  || (isAtomicSwap.value && !!swapAddressLimits.value && payment.value.amount > swapLimit.value) /* Over swap limit */
  || !(
    (asset.value === Asset.USDT && polygonConsensus.value === 'established' && hasEnoughBalance.value)
    || (isEligible.value && payWithPuntos.value)
    || (asset.value === Asset.NIM && isHtlcActive.value && hasEnoughBalance.value)
  )
  || !!goCryptoError.value,
)

watchEffect(() => {
  if (payment.value)
    checkPointsPaymentValidity()
})

watch(() => goCryptoError.value || flowErrorMessage.value, (message) => {
  if (!message)
    return
  loading.value = false
  useToast().setToast({
    message,
    type: goCryptoError.value && goCryptoIsAboutToExpire.value ? 'warning' : 'error',
    duration: 5 * 1e3,
  })
  if (goCryptoError.value)
    // Go back to QR scanner
    emit('back', StepName.QRCodeScanner)
}, { immediate: true })

function handlePay() {
  if (loading.value || isUsdtMaintenanceBlocked.value)
    return

  const paymentAnalytics = startPaymentAnalytics()

  trackPaymentStarted(buildPaymentAnalyticsProps({
    asset: asset.value,
    paymentMethod: paymentMethod.value,
    payWithPuntos: payWithPuntos.value,
    rail: payment.value.rail,
    amount: payment.value.amount,
    transfer: payment.value.transfer,
  }))

  loading.value = true
  emit('done', {
    payWithPuntos: payWithPuntos.value,
    paymentAnalytics,
    polygonQuote: usdtQuote.value || undefined,
  })
}

function formatInvoiced({ currency, amount }: { currency: string, amount: number }) {
  if (currency === 'BTC')
    return `₿ ${amount}`

  else
    return formatFiat(amount, { currency })
}

const usdtQuotedFeeFiat = computedAsync(async () => {
  if ((!isAtomicSwap.value && amounts.value?.fiatFeeAmount !== undefined) || !usdtFee.value)
    return null

  const { usePrice } = await import('@/composables/usePrice')
  const feePrice = usePrice(usdtFee.value, {
    cryptoCurrency,
    fiatCurrency: amounts.value?.fiatCurrency as any,
  })
  await feePrice.getFiatPrice()

  return {
    amount: feePrice.fiat.total,
    currency: toValue(feePrice.fiat.currency),
  }
}, null)

const usdtPreviewFiatFeeAmount = computed(() => {
  if (amounts.value?.fiatFeeAmount !== undefined)
    return amounts.value.fiatFeeAmount

  return usdtQuotedFeeFiat.value?.amount ?? null
})

const usdtTotalDebitFiat = computedAsync(async () => {
  if (!isAtomicSwap.value || asset.value !== Asset.USDT || !usdtTotalDebit.value)
    return null
  const { usePrice } = await import('@/composables/usePrice')
  const totalPrice = usePrice(usdtTotalDebit.value, { cryptoCurrency })
  await totalPrice.getFiatPrice()
  return { amount: totalPrice.fiat.total, currency: toValue(totalPrice.fiat.currency) }
}, null)

const usdtPreviewFiatTotal = computed(() => {
  if (!amounts.value?.fiatCurrency)
    return undefined
  // For atomic swaps, derive fiat from the USDT total directly to avoid rounding gaps
  if (isAtomicSwap.value && usdtTotalDebitFiat.value)
    return roundUpToTwoDecimals(usdtTotalDebitFiat.value.amount)
  return roundUpToTwoDecimals((amounts.value.fiatAmount || 0) + (usdtPreviewFiatFeeAmount.value || 0))
})

const usdtPreviewFeeFiat = computed<{ amount: number, currency: string } | null>(() => {
  if (amounts.value?.fiatCurrency && usdtPreviewFiatFeeAmount.value !== null)
    return { amount: roundUpToTwoDecimals(usdtPreviewFiatFeeAmount.value), currency: amounts.value.fiatCurrency }
  if (usdtQuotedFeeFiat.value?.currency)
    return { amount: roundUpToTwoDecimals(usdtQuotedFeeFiat.value.amount), currency: usdtQuotedFeeFiat.value.currency }
  return null
})

const totalPreviewFeeFiat = computed<{ amount: number, currency: string } | null>(() => {
  if (!usdtPreviewFeeFiat.value)
    return null
  const swapAmount = swapFee.value ?? 0
  return {
    amount: roundUpToTwoDecimals(usdtPreviewFeeFiat.value.amount + swapAmount),
    currency: usdtPreviewFeeFiat.value.currency,
  }
})

// Unified inline fee for the "incl. {fee} fees" label
const inlineFee = computed<{ amount: number, currency: string } | null>(() => {
  if (isAtomicSwap.value && swapFee.value)
    return { amount: roundedSwapFeeTotal.value, currency: selectedFiat.value }
  return totalPreviewFeeFiat.value
})

const footerMessageClass = computed(() => canPayWithPuntos.value ? 'min-h-[4rem]' : 'min-h-[1.5rem]')
</script>

<template>
  <div class="flex h-full flex-col">
    <TransactionAmounts
      class="mt-8"
      :crypto-total="isNimiqAsset ? payment.amount : usdtTotalDebit"
      :crypto-currency="cryptoCurrency"
      :fiat-amount="isNimiqAsset ? amounts?.fiatAmount : usdtPreviewFiatTotal"
      :fiat-currency="amounts?.fiatCurrency"
      :payment-method="paymentMethod"
    >
      <template v-if="payment.invoiced" #invoiced>
        {{ formatInvoiced(payment.invoiced) }}
      </template>

      <template v-if="isAtomicSwap || !isNimiqAsset" #amount-after>
        <!-- Atomic swap info popover (NIM or USDT) -->
        <PopoverRoot v-if="isAtomicSwap">
          <PopoverTrigger as-child>
            <button
              data-testid="swap-preview-info"
              type="button"
              class="inline-flex items-center justify-center -mr-[1.625rem] text-space/40 transition-colors hover:text-space/60"
              :aria-label="$t('Payment details')"
            >
              <InfoIcon class="h-[1.125rem] w-[1.125rem]" />
            </button>
          </PopoverTrigger>
          <PopoverPortal>
            <PopoverContent
              data-testid="swap-preview-details"
              class="z-50 bg-gradient-to-br from-space to-[#260133] font-semibold max-w-60 px-4 py-3 rounded"
              align="end"
              :align-offset="-32"
            >
              <!-- USDT swap: structured fee breakdown (matching wallet's approach) -->
              <template v-if="!isNimiqAsset">
                <div v-if="swapNetworkFee" class="flex items-start justify-between gap-x-4 text-sm">
                  <span class="text-white/60">{{ $t('Network fees') }}</span>
                  <span class="text-right text-white"><FiatAmount :amount="roundUpToTwoDecimals(swapNetworkFee)" :currency="selectedFiat" /></span>
                </div>
                <div v-if="swapServiceFee" class="flex items-start justify-between gap-x-4 text-sm" :class="{ 'mt-3': swapNetworkFee }">
                  <span class="text-white/60">{{ $t('Swap fee') }}</span>
                  <span class="text-right text-white"><FiatAmount :amount="roundUpToTwoDecimals(swapServiceFee)" :currency="selectedFiat" /></span>
                </div>
                <div v-if="swapFee" class="mt-3 flex items-start justify-between gap-x-4 text-sm border-t border-white/10 pt-3">
                  <span class="text-white/60">{{ $t('Total fees') }}</span>
                  <span class="text-right text-white"><FiatAmount :amount="roundedSwapFeeTotal" :currency="selectedFiat" /></span>
                </div>
              </template>
              <!-- NIM swap: simple total fee -->
              <i18n-t v-else-if="swapFee" keypath="Includes {fee} in fees" tag="p" class="text-base text-white">
                <template #fee>
                  <FiatAmount :amount="swapFee" :currency="selectedFiat" />
                </template>
              </i18n-t>
              <p class="mt-2 text-sm text-white/60">
                {{ isNimiqAsset
                  ? $t('When paying with BTC Lightning, NIM are swapped to BTC.')
                  : $t('When paying with BTC Lightning, USDT are swapped to BTC.')
                }}
              </p>
              <p class="mt-2 text-sm text-white/60">
                {{ $t('This conversion and the operation of a BTC Lightning channel require fees.') }}
              </p>
              <PopoverArrow class="fill-[#260133] pb-2" :height="16" :width="14" />
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
        <!-- Regular USDT info popover (non-swap) -->
        <PopoverRoot v-else-if="!isNimiqAsset">
          <PopoverTrigger as-child>
            <button
              data-testid="usdt-preview-info"
              type="button"
              class="inline-flex items-center justify-center -mr-[1.625rem] text-space/40 transition-colors hover:text-space/60"
              :aria-label="$t('Payment details')"
            >
              <InfoIcon class="h-[1.125rem] w-[1.125rem]" />
            </button>
          </PopoverTrigger>
          <PopoverPortal>
            <PopoverContent
              data-testid="usdt-preview-details"
              class="z-50 bg-gradient-to-br from-space to-[#260133] font-semibold max-w-60 px-4 py-3 rounded"
              align="end"
              :align-offset="-32"
            >
              <div class="flex items-start justify-between gap-x-4 text-sm">
                <span class="text-white/60">{{ $t('Network') }}</span>
                <span class="text-right text-white">USDT · Polygon</span>
              </div>
              <div class="mt-3 flex items-start justify-between gap-x-4 text-sm">
                <span class="text-white/60">{{ $t('Recipient') }}</span>
                <span class="max-w-[13rem] break-all text-right text-white">{{ payment.recipient }}</span>
              </div>
              <div v-if="usdtQuoteLoading && !usdtQuote" class="mt-3 text-sm text-white/70">
                {{ $t('Calculating Polygon fee...') }}
              </div>
              <div v-if="usdtQuote" class="mt-3 flex items-start justify-between gap-x-4 text-sm">
                <span class="text-white/60">{{ $t('Polygon fee') }}</span>
                <span class="text-right text-white">{{ formatUsdtAmount(usdtQuote.fee) }}</span>
              </div>
              <div v-if="usdtQuote" class="mt-3 flex items-start justify-between gap-x-4 text-sm">
                <span class="text-white/60">{{ $t('Total debit') }}</span>
                <span class="text-right text-white">{{ formatUsdtAmount(usdtQuote.totalDebit) }}</span>
              </div>
              <PopoverArrow class="fill-[#260133] pb-2" :height="16" :width="14" />
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
      </template>

      <template v-if="asset === Asset.NIM" #fee>
        <template v-if="payment.feeIncludedInAmount">
          {{ $t('Incl. fees') }}
        </template>
        <i18n-t v-else-if="payment.fiatFeeAmount && amounts?.fiatFeeAmount != null && amounts?.fiatCurrency" keypath="Fees may apply {fee}">
          <template #fee>
            (~<FiatAmount :amount="amounts.fiatFeeAmount" :currency="amounts.fiatCurrency" />)
          </template>
        </i18n-t>
        <template v-else-if="payment.fiatFeeAmount || payment.fee">
          {{ $t('Fees may apply {fee}', { fee: '' }) }}
        </template>
      </template>

      <template v-if="!isNimiqAsset && (inlineFee || usdtFeeText)" #crypto-after>
        <span aria-label="Fee included">
          <i18n-t v-if="inlineFee" keypath="incl. {fee} fees">
            <template #fee>
              <FiatAmount :amount="inlineFee.amount" :currency="inlineFee.currency" />
            </template>
          </i18n-t>
          <span v-else>{{ usdtFeeText }}</span>
        </span>
      </template>
    </TransactionAmounts>

    <div class="mt-auto flex w-full flex-col items-center pb-6">
      <IonToggle
        v-if="canPayWithPuntos && asset === Asset.NIM && pointsState !== PointsState.NotRegistered && payment.rail !== Rail.BitcoinLightning"
        :disabled="!isEligible"
        label-placement="end" class="mb-4"
        :checked="paymentMethod === PaymentMethod.Points"
        @ion-change="payWithPuntos = $event.detail.checked"
      >
        <i18n-t keypath="Use {amount}" tag="div" class="flex items-center text-lg font-semibold">
          <template #amount>
            <CryptoCityLogo class="w-5 h-5 ml-1.5 mr-1" />
            {{ formatCrypto(payment.amount) }}
          </template>
        </i18n-t>
      </IonToggle>

      <div class="mb-6 w-full font-semibold text-center" :class="footerMessageClass">
        <Transition name="slide-fade" mode="out-in">
          <template v-if="asset === Asset.NIM">
            <p v-if="(!isHtlcActive || !isRemoteOk) && isEligible" class="text-pumpkin">
              {{ $t('Your NIM balance is not available yet. You can only pay with Points.') }}
            </p>
            <p v-else-if="!hasEnoughBalance && isEligible && !loading" class="text-pumpkin">
              {{ $t('You don\'t have enough NIM for this purchase. You can only pay with Points.') }}
            </p>
            <p v-else-if="!hasEnoughBalance && !isEligible && !loading" class="text-pumpkin">
              {{ $t('You don\'t have enough NIM for this purchase.') }}
            </p>
            <p v-else-if="isAtomicSwap && loadingSwapLimits" class="flex items-center justify-center opacity-60 gap-x-2">
              <LoadingSpinner class="w-4 h-4 shrink-0" />
              {{ $t('Loading swap limits...') }}
            </p>
            <p v-else-if="isAtomicSwap && payment.amount > swapLimit" class="text-pumpkin">
              {{ $t('Exceeding 30-day swap limit. Your payment allowance for BTC LN is {remainingFiatLimits}', { remainingFiatLimits }) }}
            </p>
            <p
              v-else-if="[PointsState.NotEligibleForPayment, PointsState.InsufficientPoints, PointsState.Error].includes(pointsState)"
              :class="pointsState === PointsState.Error ? 'text-pumpkin' : 'opacity-60'"
            >
              {{ pointsMessage }}
            </p>
            <p v-else-if="hasCashback && paymentMethod === PaymentMethod.Points" class="opacity-60">
              {{ $t('There is no cashback reward when paying with Points.') }}
            </p>
            <p v-else-if="hasCashback && paymentMethod !== PaymentMethod.Points" class="opacity-60">
              {{ pointsMessage }}
            </p>
            <p v-else-if="payment.message" class="opacity-60">
              {{ payment.message }}
            </p>
          </template>
          <template v-else-if="asset === Asset.USDT">
            <p v-if="isUsdtMaintenanceActive" class="text-pumpkin">
              {{ usdtMaintenanceNotice }}
            </p>
            <p v-else-if="polygonConsensus !== 'established'" class="text-pumpkin">
              {{ $t('Polygon is still connecting. Please wait a moment.') }}
            </p>
            <p v-else-if="isAtomicSwap && (loadingSwapLimits || loadingHtlcFee)" class="flex items-center justify-center opacity-60 gap-x-2">
              <LoadingSpinner class="w-4 h-4 shrink-0" />
              {{ $t('Loading swap limits...') }}
            </p>
            <p v-else-if="isAtomicSwap && payment.amount > swapLimit" class="text-pumpkin">
              {{ $t('Exceeding 30-day swap limit. Your payment allowance for BTC LN is {remainingFiatLimits}', { remainingFiatLimits }) }}
            </p>
            <p v-else-if="usdtQuoteError && !loading" class="text-pumpkin">
              {{ usdtQuoteError }}
            </p>
            <p v-else-if="!usdtQuoteLoading && !hasEnoughBalance && !loading" class="text-pumpkin">
              {{ $t('You don\'t have enough USDT to cover this payment plus Polygon fees.') }}
            </p>
            <p v-else-if="payment.message" class="opacity-60">
              {{ payment.message }}
            </p>
          </template>
        </Transition>
      </div>

      <PolygonWarning
        v-if="asset === Asset.USDT && !isAtomicSwap"
        class="mb-6"
        :message="$t('Always check if you are paying to a Polygon address, or your funds might be permanently lost!')"
        :tooltip-message="$t('The Pay app uses USDT on the Polygon network. Sending funds to a non-Polygon address could result in permanent loss.')"
      />

      <i18n-t
        v-if="isAtomicSwap"
        keypath="By tapping “pay”, you agree to Fastspot's {terms}"
        tag="p" class="mb-4 font-semibold text-center opacity-50"
      >
        <template #terms>
          <a class="underline" @click="Browser.open({ url: 'https://fastspot.io/terms/', toolbarColor: '#0582CA' })">
            {{ $t('Terms of service') }}
          </a>
        </template>
      </i18n-t>
      <IonButton
        data-testid="payment-preview-pay"
        aria-label="Pay"
        expand="block"
        class="w-full text-base font-bold [&_ion-spinner]:h-4"
        :disabled="isUsdtMaintenanceBlocked || (!isConfirmationAlert && disabled)"
        @click="handlePay"
      >
        <Transition
          mode="out-in"
          name="slide-fade"
        >
          <LoadingSpinner v-if="loading" class="w-4 h-4 m-auto text-white" />
          <span v-else>{{ $t('Pay') }}</span>
        </Transition>
      </IonButton>
    </div>
  </div>
</template>
