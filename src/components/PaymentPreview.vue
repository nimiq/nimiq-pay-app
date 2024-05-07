<script setup lang="ts">
import { Browser } from '@capacitor/browser'
import { IonButton, IonToggle } from '@ionic/vue'
import { computed, effectScope, onUnmounted, ref, watch, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import LoadingSpinner from './icons/loading-spinner.vue'
import { Rail } from '@/types/transactions'
import { PaymentMethod, StepName, stepEmits } from '@/lib/flows/steps.types'
import type { PaymentRequestData, State } from '@/lib/flows/steps.types'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'

// TODO: async import
import { useToast } from '@/composables/useToast'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const { consensus } = storeToRefs(useNimiqNetwork())
const { isHtlcActive, isRemoteOk } = storeToRefs(useRemoteSigner())
const { formatFiat, formatCrypto } = useCurrencyFormatter()

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
    const { formatFiat } = (await import('@/composables/useCurrencyFormatter')).useCurrencyFormatter()
    return { formattedFiat: formatFiat(payment.value.fiatAmount!, { currency: payment.value.fiatCurrency }), formattedFee: formatFiat(payment.value.fiatFeeAmount!, { currency: payment.value.fiatCurrency }) }
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
    return { formattedFiat: fiatAmount.fiat.formatted, formattedFee: fiatFeeAmount.fiat.formatted }
  }
})

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
const disabled = computed(() =>
  !(
    (isEligible.value && paymentMethod.value === PaymentMethod.Points)
    || (isHtlcActive.value && hasEnoughNimBalance.value && consensus.value === 'established')
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

function formatInvoiced({ currency, amount }: { currency: string; amount: number }) {
  if (currency === 'BTC')
    return `₿ ${amount}`

  else
    return formatFiat(amount, { currency })
}
</script>

<template>
  <TransactionAmounts class="mt-8" :crypto-total="payment.amount" :fiat-formatted="amounts?.formattedFiat || ''" :payment-method="paymentMethod">
    <template v-if="payment.invoiced" #invoiced>
      {{ formatInvoiced(payment.invoiced) }}
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
      @ion-change="(e) => e.detail.checked ? paymentMethod = PaymentMethod.Points : paymentMethod = PaymentMethod.NIM"
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
        <p v-else-if="!hasEnoughNimBalance && isEligible" class="text-pumpkin">
          {{ $t('You don\'t have enough NIM for this purchase. You can only pay with Points.') }}
        </p>
        <p v-else-if="!hasEnoughNimBalance && !isEligible" class="text-pumpkin">
          {{ $t('You don\'t have enough NIM for this purchase.') }}
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
      v-if="payment.rail === Rail.BitcoinLightning"
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
