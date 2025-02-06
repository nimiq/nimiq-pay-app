<script setup lang="ts">
import QuickButton from '@/components/QuickButton.vue'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { useStringParser } from '@/composables/useStringParser'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { IonRippleEffect } from '@ionic/vue'
import { computedAsync } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  invoice: {
    type: String,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['onContinue'])

const logger = useLogger('LightningInvoiceDetectedModal')

const amounts = ref<{ formattedFiat: string, formattedFee: string } | null>(null)

const payment = computedAsync(async () => {
  const { data, error } = await useStringParser().getPaymentRequestData(props.invoice)
  if (error) {
    logger.error(error)
    return null
  }
  return data
})

// Using watch instead of computedAsync because updating the fiat values triggered a recomputation
watch(payment, async () => {
  if (!payment.value)
    return null
  // Otherwise, use the API to get the fiat values
  const fiatAmount = usePrice(payment.value.amount)
  const fiatFeeAmount = usePrice(payment.value.fee)
  // Force update the fiat values, we are not doing it in parallel because
  // we want to get the fee amount from the db instead of API
  await fiatAmount.getFiatPrice()
  await fiatFeeAmount.getFiatPrice()
  amounts.value = { formattedFiat: fiatAmount.fiat.formatted, formattedFee: fiatFeeAmount.fiat.formatted }
}, { immediate: true })

const shortInvoice = computed(() => {
  const { invoice } = props
  if (invoice.toLowerCase().startsWith('http')) {
    return (new URL(invoice)).hostname
  }
  return `${invoice.slice(0, 6)} . . . ${invoice.slice(-6)}`
})

async function handleContinue() {
  if (props.disabled)
    return
  await initializeFlow(FlowName.NimOrPointsPayment, { qrCodeScanner: props.invoice })
  emit('onContinue')
}
</script>

<template>
  <div class="bg-white">
    <div
      class="relative flex items-center justify-between p-3 pr-6 overflow-hidden rounded-md ion-activatable ripple-parent"
      :class="{ 'opacity-50': props.disabled }"
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
          {{ shortInvoice }}
        </p>
      </div>
      <div>
        <QuickButton show-chevron center chevron-color="white" class="text-sm text-white">
          {{ $t('PAY') }}
        </QuickButton>
      </div>
      <IonRippleEffect v-if="!props.disabled" />
    </div>
  </div>
</template>
