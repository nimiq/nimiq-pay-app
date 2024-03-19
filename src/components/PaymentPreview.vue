<script setup lang="ts">
import { IonButton, IonToggle } from '@ionic/vue'
import { computed, ref, toRef, watch, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import LoadingSpinner from './icons/loading-spinner.vue'
import { PaymentMethod, StepName, stepEmits } from '@/lib/flows/steps.types'
import type { PaymentRequestData, State } from '@/lib/flows/steps.types'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'

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

const payment = toRef(() => props.state[StepName.QRCodeScanner] as PaymentRequestData || { amount: 0, fee: 0, recipient: '', transfer: Transfer.UserPayment })
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

const paymentMethod = ref<PaymentMethod>((!hasEnoughNimBalance.value && isEligible.value) ? PaymentMethod.Points : PaymentMethod.NIM)
const disabled = computed(() => !(isEligible.value && paymentMethod.value === PaymentMethod.Points) && (!isHtlcActive.value || !hasEnoughNimBalance.value || consensus.value !== 'established'))

const loading = ref(false)

watchEffect(() => {
  if (payment.value)
    checkPointsPaymentValidity()
})

watch(() => props.errorMsg, () => {
  if (props.errorMsg) {
    loading.value = false
    useToast().setToast({ message: props.errorMsg, error: true, duration: 5 * 1e3 })
  }
})

function handlePay() {
  if (loading.value)
    return

  loading.value = true
  emit('done', paymentMethod.value)
}

function formatInvoiced({ currency, amount }: { currency: string; amount: number }) {
  if (currency === 'BTC') {
    return `₿ ${amount}`
  }
  else {
    const { formatFiat } = useCurrencyFormatter()
    return formatFiat(amount, { currency })
  }
}
</script>

<template>
  <TransactionAmounts class="mt-8" :crypto-total="payment.amount / 1e5" :fiat-formatted="amounts?.formattedFiat || ''" :payment-method="paymentMethod">
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
      v-if="pointsState !== PointsState.NotRegistered"
      :disabled="!isEligible"
      label-placement="end" class="mb-4"
      :checked="paymentMethod === PaymentMethod.Points"
      @ion-change="(e) => e.detail.checked ? paymentMethod = PaymentMethod.Points : paymentMethod = PaymentMethod.NIM"
    >
      <i18n-t keypath="Use {amount}" tag="div" class="flex items-center text-lg font-semibold">
        <template #amount>
          <CryptoCityLogo class="w-5 h-5 ml-1.5 mr-1" />
          {{ (payment.amount / 1e5).toLocaleString() }}
        </template>
      </i18n-t>
    </IonToggle>

    <div class="mb-6 font-semibold text-center min-h-[4rem]">
      <Transition name="slide-fade" mode="out-in">
        <p v-if="(!isHtlcActive || !isRemoteOk) && isEligible" class="text-pumpkin text-pretty">
          {{ $t('Your NIM balance is not available yet. You can only pay with Points.') }}
        </p>
        <p v-else-if="!hasEnoughNimBalance && isEligible" class="text-pumpkin text-pretty">
          {{ $t('You don\'t have enough NIM for this purchase. You can only pay with Points.') }}
        </p>
        <p v-else-if="!hasEnoughNimBalance && !isEligible" class="text-pumpkin text-pretty">
          {{ $t('You don\'t have enough NIM for this purchase.') }}
        </p>
        <p
          v-else-if="[PointsState.NotEligibleForPayment, PointsState.InsufficientPoints, PointsState.Error].includes(pointsState)"
          class="text-pretty" :class="pointsState === PointsState.Error ? 'text-pumpkin' : 'opacity-60'"
        >
          {{ pointsMessage }}
        </p>
        <p v-else-if="hasCashback && paymentMethod === PaymentMethod.Points" class="opacity-60 text-pretty">
          {{ $t('There is no cashback reward when paying with Points.') }}
        </p>
        <p v-else-if="hasCashback && paymentMethod !== PaymentMethod.Points" class="opacity-60 text-pretty">
          {{ pointsMessage }}
        </p>
      </Transition>
    </div>
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
