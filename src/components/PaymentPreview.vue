<script setup lang="ts">
import type { PaymentRequestData, State } from '@/lib/flows/steps.types'
import type { IonToggleCustomEvent, ToggleChangeEventDetail } from '@ionic/core'
import type { PropType } from 'vue'
import type { Crypto } from '../stores/app'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useFastspotApiV1 } from '@/composables/useFastspotv1'
import { useLogger } from '@/composables/useLogger'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
// TODO: async import
import { useToast } from '@/composables/useToast'
import { PaymentMethod, stepEmits, StepName } from '@/lib/flows/steps.types'
import { useLocalWallet } from '@/stores/local-wallet'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Rail } from '@/types/transactions'
import { Browser } from '@capacitor/browser'
import { IonButton, IonToggle } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'radix-vue'
import { computed, effectScope, onUnmounted, ref, watch, watchEffect } from 'vue'
import InfoIcon from './icons/info.vue'
import LoadingSpinner from './icons/loading-spinner.vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
})

const emit = defineEmits(stepEmits)

const logger = useLogger('PaymentPreview')

const { isHtlcActive, isRemoteOk } = storeToRefs(useRemoteSigner())
const { formatFiat, formatCrypto } = useCurrencyFormatter()
const { localAddress } = storeToRefs(useLocalWallet())

const payment = computed<Omit<PaymentRequestData, 'transfer'>>(() => typeof props.state[StepName.QRCodeScanner] === 'object'
  ? props.state[StepName.QRCodeScanner]
  : { amount: 0, fee: 0, recipient: '' },
)
const hasEnoughNimBalance = computed(() => useRemoteSigner().remoteBalance >= payment.value.amount)

const amounts = computedAsync(async () => {
  // If the tx has its own fiat values, use them, otherwise use the API to get the fiat values
  // We check for undefined because the tx might have 0 as a value, which is falsy
  const properties = ['fiatCurrency', 'fiatAmount', 'fiatFeeAmount'] as const
  const useDefaultFiat = properties.some(prop => payment.value[prop] === undefined)

  if (!useDefaultFiat) {
    // If the tx has its own fiat values, use them
    const { fiatAmount, fiatFeeAmount, fiatCurrency } = payment.value
    return {
      fiatAmount,
      fiatFeeAmount,
      fiatCurrency,
    }
  }
  else {
    // Otherwise, use the API to get the fiat values
    const { usePrice } = await import('@/composables/usePrice')
    const fiatAmount = usePrice(payment.value.amount)
    const fiatFeeAmount = usePrice(payment.value.fee)
    // Force update the fiat values, we are not doing it in parallel because
    // we want to get the fee amount from the db instead of API
    await fiatAmount.getFiatPrice()
    await fiatFeeAmount.getFiatPrice()
    return { fiatAmount: fiatAmount.fiat.total, fiatFeeAmount: fiatFeeAmount.fiat.total, fiatCurrency: fiatAmount.fiat.currency }
  }
})

const swapFee = computedAsync(async () => {
  if (!payment.value.swap?.fees)
    return null

  const { usePrice } = await import('@/composables/usePrice')
  let total = 0
  for (const fee of payment.value.swap.fees) {
    const fiatAmount = usePrice(fee.amount, {
      cryptoCurrency: fee.asset as Crypto,
      reactiveToNetwork: false,
    })
    await fiatAmount.getFiatPrice()
    total += fiatAmount.fiat.total
  }
  return total
}, null)

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
  window.setTimeout(() => unwatchGoCryptoRail(), 0) // run after watcher invocation
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

const paymentMethod = ref<PaymentMethod>((!hasEnoughNimBalance.value && isEligible.value) ? PaymentMethod.Points : PaymentMethod.NIM)

const loadingSwapLimits = ref(false)
const isAtomicSwap = computed(() => !!payment.value.swap)
const nimAddressLimits = computedAsync(async () => {
  if (!isAtomicSwap.value)
    return null

  loadingSwapLimits.value = true
  // https://github.com/nimiq/wallet/blob/1102b802030833d5d84d9c304baa85331ba51362/src/composables/useSwapLimits.ts#L252
  const { getLimits, SwapAsset } = await useFastspotApiV1()
  try {
    const limits = await getLimits(SwapAsset.NIM, localAddress.value.toUserFriendlyAddress(), localAddress.value.toHex())
    loadingSwapLimits.value = false
    return limits
  }
  catch (error) {
    logger.error('Failed to get swap limits', error)
    loadingSwapLimits.value = false
    return null
  }
}, null /* Initial state */)

// Buffer 1% of the swap limit to avoid slippage
const lunaSwapLimit = computed(() => nimAddressLimits.value ? Math.floor(nimAddressLimits.value.current * 0.99) : 0)
const remainingFiatLimits = computedAsync(async () => {
  // Don't need to do extra computation if the payment is not atomic swap or the swap is not over the limit
  if (!isAtomicSwap.value || lunaSwapLimit.value < payment.value.amount)
    return

  const { usePrice } = await import('@/composables/usePrice')
  const fiatAmount = usePrice(lunaSwapLimit)
  await fiatAmount.getFiatPrice()
  return fiatAmount.fiat.formatted
})

const disabled = computed(() =>
  (isAtomicSwap.value && loadingSwapLimits.value) /* Not loaded yet */
  // If failed to get limits, allow payment cause in case of being over the limit, it will fail when confirming swap
  || (isAtomicSwap.value && !!nimAddressLimits.value && payment.value.amount > lunaSwapLimit.value) /* Over swap limit */
  || !(
    (isEligible.value && paymentMethod.value === PaymentMethod.Points)
    || (isHtlcActive.value && hasEnoughNimBalance.value)
  )
  || !!goCryptoError.value,
)

const loading = ref(false)

watchEffect(() => {
  if (payment.value)
    checkPointsPaymentValidity()
})

watch(() => goCryptoError.value || props.errorMsg, (message) => {
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
  if (loading.value)
    return

  loading.value = true
  emit('done', paymentMethod.value)
}

function formatInvoiced({ currency, amount }: { currency: string, amount: number }) {
  if (currency === 'BTC')
    return `₿ ${amount}`

  else
    return formatFiat(amount, { currency })
}
</script>

<template>
  <TransactionAmounts class="mt-8" :crypto-total="payment.amount" :fiat-amount="amounts?.fiatAmount" :fiat-currency="amounts?.fiatCurrency" :payment-method="paymentMethod">
    <template v-if="payment.invoiced" #invoiced>
      {{ formatInvoiced(payment.invoiced) }}
    </template>

    <template v-if="isAtomicSwap" #amount-after>
      <PopoverRoot class="bg-space/10">
        <PopoverTrigger as-child>
          <InfoIcon class="w-[1.125rem] h-[1.125rem] opacity-40 -mr-[1.625rem]" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent class="bg-gradient-to-br from-space to-[#260133] font-semibold max-w-60 px-4 py-3 rounded" align="end" :align-offset="-32">
            <p v-if="swapFee" class="text-base text-white">
              {{ $t('Includes {fee} in fees', { fee: formatFiat(swapFee) }) }}
            </p>
            <p class="mt-1 text-sm text-white/60">
              {{ $t('When paying with BTC Lightning, NIM are swapped to BTC.') }}
            </p>
            <p class="mt-2 text-sm text-white/60">
              {{ $t('This conversion and the operation of a BTC Lightning channel require fees.') }}
            </p>
            <PopoverArrow class="fill-[#260133] pb-2" :height="16" :width="14" />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </template>

    <template v-if="payment.feeIncludedInAmount" #fee>
      {{ $t('Incl. fees') }}
    </template>
    <template v-else-if="payment.fiatFeeAmount || payment.fee" #fee>
      {{ $t('Fees may apply {fee}', { fee: payment.fiatFeeAmount ? `(~${amounts?.formattedFee || 0})` : '' }) }}
    </template>
  </TransactionAmounts>
  <div class="flex flex-col items-center w-full pb-6 mt-auto">
    <IonToggle
      v-if="pointsState !== PointsState.NotRegistered && payment.rail !== Rail.BitcoinLightning"
      :disabled="!isEligible"
      label-placement="end" class="mb-4"
      :checked="paymentMethod === PaymentMethod.Points"
      @ion-change="(e: IonToggleCustomEvent<ToggleChangeEventDetail>) => e.detail.checked ? paymentMethod = PaymentMethod.Points : paymentMethod = PaymentMethod.NIM"
    >
      <i18n-t keypath="Use {amount}" tag="div" class="flex items-center text-lg font-semibold">
        <template #amount>
          <CryptoCityLogo class="w-5 h-5 ml-1.5 mr-1" />
          {{ formatCrypto(payment.amount) }}
        </template>
      </i18n-t>
    </IonToggle>

    <div class="mb-6 font-semibold text-center min-h-[4rem]">
      <Transition name="slide-fade" mode="out-in">
        <p v-if="(!isHtlcActive || !isRemoteOk) && isEligible" class="text-pumpkin">
          {{ $t('Your NIM balance is not available yet. You can only pay with Points.') }}
        </p>
        <p v-else-if="!hasEnoughNimBalance && isEligible && !loading" class="text-pumpkin">
          {{ $t('You don\'t have enough NIM for this purchase. You can only pay with Points.') }}
        </p>
        <p v-else-if="!hasEnoughNimBalance && !isEligible && !loading" class="text-pumpkin">
          {{ $t('You don\'t have enough NIM for this purchase.') }}
        </p>
        <p v-else-if="isAtomicSwap && loadingSwapLimits" class="flex opacity-60 gap-x-2">
          <LoadingSpinner class="w-4 h-4 m-auto" />
          {{ $t('Loading swap limits...') }}
        </p>
        <p v-else-if="isAtomicSwap && payment.amount > lunaSwapLimit" class="text-pumpkin">
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
      </Transition>
    </div>
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
    <IonButton expand="block" class="w-full text-base font-bold [&_ion-spinner]:h-4" :disabled="disabled" @click="handlePay">
      <Transition
        mode="out-in"
        name="slide-fade"
      >
        <LoadingSpinner v-if="loading" class="w-4 h-4 m-auto text-white" />
        <span v-else>{{ $t('Pay') }}</span>
      </Transition>
    </IonButton>
  </div>
</template>
