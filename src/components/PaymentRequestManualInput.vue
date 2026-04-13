<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { computedAsync, useTextareaAutosize } from '@vueuse/core'
import { ref } from 'vue'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { useStringParser } from '@/composables/useStringParser'
import { Asset, assetToCrypto } from '@/lib/assets'
import { stepEmits } from '@/lib/flows/steps.types'

const emit = defineEmits(stepEmits)

const logger = useLogger('PaymentRequestManualInput')

const { textarea, input: invoice } = useTextareaAutosize()
const isFocused = ref(false)
const paymentRequestError = ref<string | null>(null)

const payment = computedAsync(async () => {
  if (!invoice.value)
    return undefined
  const { data, error } = await useStringParser().getPaymentRequestData(invoice.value)
  if (error) {
    logger.error(error)
    paymentRequestError.value = error
    return null
  }
  return data
})

const amounts = computedAsync(async () => {
  if (!payment.value)
    return null
  // Otherwise, use the API to get the fiat values
  const cryptoCurrency = assetToCrypto(payment.value.asset ?? Asset.NIM)
  const fiatAmount = usePrice(payment.value.amount, { cryptoCurrency })
  const fiatFeeAmount = usePrice(payment.value.fee, { cryptoCurrency })
  await Promise.all([fiatAmount.getFiatPrice(), fiatFeeAmount.getFiatPrice()])
  return { formattedFiat: fiatAmount.fiat.formatted, formattedFee: fiatFeeAmount.fiat.formatted }
})

function handleContinue() {
  emit('done', payment.value)
}
</script>

<template>
  <div class="flex flex-col items-center w-full h-full p-4 mt-8 gap-y-4">
    <textarea
      ref="textarea"
      v-model="invoice"
      class="uppercase transition-colors duration-300 textarea"
      :placeholder="$t('Paste or type the invoice here')"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @keypress.enter="textarea?.blur"
    />
    <Transition name="slide-fade">
      <p v-if="payment && amounts" class="text-lg font-semibold text-space/60">
        {{ payment.merchantName || payment.message || $t('Payment Request') }} - {{ amounts.formattedFiat }}
      </p>
    </Transition>
    <Transition name="slide-fade">
      <IonButton v-if="payment && !isFocused" expand="block" class="w-full mt-auto text-base font-bold" @click="handleContinue">
        {{ $t('Continue and Pay') }}
      </IonButton>
    </Transition>

    <Transition name="slide-fade">
      <p v-if="payment === null" class="text-pumpkin">
        {{ paymentRequestError || $t('Unknown error processing payment request') }}
      </p>
    </Transition>
  </div>
</template>

<style scoped>
textarea {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

textarea::-webkit-scrollbar {
  display: none;
}

.textarea {
  border: 1.5px solid transparent;
  background: theme('colors.space.space-100');
  padding: 0.75rem;
  border-radius: 0.25rem;
  font-weight: 500;
  display: block;
  width: 100%;
  resize: none;
  min-height: 10rem;
  max-height: 60vh;
  line-height: 20px;
  outline: none;
}

.textarea:focus {
  border-color:  theme('colors.sky.400');
  color: theme('colors.sky.DEFAULT');
  background: white;
}

/* Removing leave transition */
.slide-fade-leave-active {
  transition: none;
}
</style>
