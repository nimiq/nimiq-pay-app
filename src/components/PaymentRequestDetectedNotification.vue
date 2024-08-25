<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { IonRippleEffect } from '@ionic/vue'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { useStringParser } from '@/composables/useStringParser'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import QuickButton from '@/components/QuickButton.vue'

const props = defineProps({
  invoice: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['onContinue'])

const logger = useLogger('LightningInvoiceDetectedModal')

const payment = computedAsync(async () => {
  const { data, error } = await useStringParser().getPaymentRequestData(props.invoice)
  if (error) {
    logger.error(error)
    return null
  }
  return data
})

const amounts = computedAsync(async () => {
  if (!payment.value)
    return null
  // Otherwise, use the API to get the fiat values
  const fiatAmount = usePrice(payment.value.amount)
  const fiatFeeAmount = usePrice(payment.value.fee)
  // Force update the fiat values, we are not doing it in parallel because
  // we want to get the fee amount from the db instead of API
  await fiatAmount.getFiatPrice()
  await fiatFeeAmount.getFiatPrice()
  return { formattedFiat: fiatAmount.fiat.formatted, formattedFee: fiatFeeAmount.fiat.formatted }
})

async function handleContinue() {
  await initializeFlow(FlowName.NimOrPointsPayment, { qrCodeScanner: props.invoice })
  emit('onContinue')
}
</script>

<template>
  <div
    class="relative flex items-center justify-between p-3 pr-6 overflow-hidden rounded-md ion-activatable ripple-parent"
    style="background: var(--radial-gradient-light-blue);"
    @click="handleContinue"
  >
    <div>
      <Transition name="slide-fade">
        <p v-if="payment && amounts" class="font-bold text-white">
          {{ payment.merchantName || payment.message || $t('Payment Request') }} - {{ amounts.formattedFiat }}
        </p>
      </Transition>
      <p class="font-normal uppercase text-white/70 text-nowrap">
        {{ `${props.invoice.slice(0, 6)} . . . ${props.invoice.slice(-6)}` }}
      </p>
    </div>
    <div>
      <QuickButton show-chevron center chevron-color="white" class="text-sm text-white">
        {{ $t('PAY') }}
      </QuickButton>
    </div>
    <IonRippleEffect />
  </div>
</template>
