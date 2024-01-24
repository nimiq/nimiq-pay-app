<script setup lang="ts">
import { IonButton, IonSpinner, IonToggle } from '@ionic/vue'
import { computed, ref, toRef, watch } from 'vue'
import type { PropType } from 'vue'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import { PaymentMethod, StepName, stepEmits } from '@/lib/flows/steps.types'
import type { Flow, PaymentRequestData } from '@/lib/flows/steps.types'
import { PointsState, usePointsPayment } from '@/composables/usePointsPayment'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<Flow['state']>, required: true }, isVisible: { type: Boolean, required: true } })
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
    return { formattedFiat: usePrice(payment.value.amount).fiat.formatted, formattedFee: usePrice(payment.value.fee).fiat.formatted }
  }
})

const { hasCashback, message: pointsMessage, pointsState, checkPointsPaymentValidity, isEligible }
   = usePointsPayment({ amount: payment.value.amount, rail: payment.value.rail, recipient: payment.value.recipient, reference: payment.value.paymentRef })

const paymentMethod = ref<PaymentMethod>(!hasEnoughNimBalance.value && isEligible.value ? PaymentMethod.Points : PaymentMethod.NIM)
const disabled = computed(() => !(isEligible.value && paymentMethod.value === PaymentMethod.Points) && (!hasEnoughNimBalance.value || consensus.value !== 'established'))

const loading = ref(false)

watch(payment, checkPointsPaymentValidity)

function handlePay() {
  if (loading.value)
    return

  loading.value = true
  emit('done', paymentMethod.value)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center mt-8 gap-y-2">
    <TransactionAmounts :crypto-total="payment.amount / 1e5" :fiat-formatted="amounts?.formattedFiat || ''" :payment-method="paymentMethod">
      <template #fee>
        {{ $t('Fees may apply {fee}', { fee: payment.fiatFeeAmount ? `(~${amounts?.formattedFee || 0})` : '' }) }}
      </template>
    </TransactionAmounts>

    <Transition name="slide-fade" mode="out-in">
      <div
        v-if="hasCashback"
        class="flex items-baseline mt-8 font-semibold gap-x-1.5 transition-colors text-pretty text-center px-16"
        :class="{ '[&>*]:opacity-60 ': paymentMethod === PaymentMethod.Points }"
      >
        <InfoIcon class="w-6 stroke-2" />
        <p>{{ pointsMessage }}</p>
      </div>
    </Transition>
  </div>
  <div class="flex flex-col items-center w-full pb-6 mt-auto">
    <IonToggle
      v-if="hasEnoughNimBalance || pointsState === PointsState.Eligible" :disabled="!isEligible"
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
        <p v-if="!hasEnoughNimBalance && !isEligible" class="text-pumpkin text-pretty">
          {{ $t('You don\'t have enough NIM for this purchase.') }}
        </p>
        <p v-else-if="(!isHtlcActive || !isRemoteOk) && paymentMethod !== PaymentMethod.Points" class="text-pumpkin text-pretty">
          {{ $t('You cannot pay with NIM yet, wait until the Top-Up is completed') }}
        </p>
        <p v-else-if="pointsState === PointsState.InsufficientPoints" class="opacity-60text-pretty">
          {{ $t('You don\'t have enough Points for this purchase.') }}
        </p>
        <p v-else-if="pointsState === PointsState.NotEligibleForPayment" class="opacity-60 text-pretty">
          {{ $t('You can\'t pay with Points for this purchase.') }}
        </p>
        <p v-else-if="pointsState === PointsState.Error" class="text-pumpkin text-pretty">
          {{ pointsMessage }}
        </p>
        <p v-else-if="hasCashback" class="opacity-60 text-pretty">
          {{ $t('There is no cashback reward when paying with Points.') }}
        </p>
      </transition>
    </div>

    <IonButton expand="block" class="w-full text-base font-bold" :disabled="disabled" @click="handlePay">
      <template v-if="loading">
        <IonSpinner class="text-white" name="dots" />
      </template>
      <template v-else>
        {{ $t('Pay') }}
      </template>
    </IonButton>
  </div>
</template>
