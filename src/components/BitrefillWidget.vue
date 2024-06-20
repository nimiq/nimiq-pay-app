<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { IonButton } from '@ionic/vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { useStringParser } from '../composables/useStringParser'
import { useToast } from '../composables/useToast'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

// const props = defineProps()

const emit = defineEmits(stepEmits)

type InvoiceCreated = {
  event: 'invoice_created',
  invoiceId: string,
  /** Includes 'lightning:' prefix */
  paymentUri: string,
  paymentMethod: 'lightning',
  paymentAmount: number, // In BTC
  paymentCurrency: "BTC",
  /** Excludes 'lightning:' prefix */
  paymentAddress: string,
}

type PaymentIntent = {
  event: 'payment_intent',
  invoiceId: string,
  /** Includes 'lightning:' prefix */
  paymentUri: string,
  paymentMethod: 'lightning',
  paymentAmount: number, // In BTC
  paymentCurrency: "BTC",
  /** Excludes 'lightning:' prefix */
  paymentAddress: string,
}

type InvoiceUpdate = {
  event: 'invoice_update',
  invoiceId: string,
  status:
    | 'payment_detected'
    | 'payment_confirmed'
    | 'expired'
    | 'refunded'
}

type InvoiceComplete = {
  event: 'invoice_complete',
  invoiceId: string,
  deliveryStatus:
    | 'not_delivered'
    | 'all_delivered'
    | 'all_error'
    | 'partial_delivery"'
  refundNeeded: boolean
}

type BitrefillEvent = InvoiceCreated | PaymentIntent | InvoiceUpdate | InvoiceComplete

async function onMessage(e: MessageEvent) {
  if (e.origin !== 'https://embed.bitrefill.com') {
    return
  }

  let data: BitrefillEvent
  try {
    data = JSON.parse(e.data) as BitrefillEvent
  } catch (error) {
    console.error('Failed to JSON-parse Bitrefill event data:', error)
    return
  }

  console.log('Received Bitrefill event:', data)

  const { event } = data

  switch(event) {
    case 'payment_intent': {
      const {
        invoiceId,
        paymentUri
      } = data
      // Pay the users invoice with the `paymentUri`
      const requestData = await useStringParser().getPaymentRequestData(paymentUri)
      if ('error' in requestData && requestData.error) {
        useToast().setToast({ message: requestData.error, type: 'error' })
        return
      }
      console.log('Payment request data:', requestData.data)
      emit('done', requestData.data)
      // TODO: Store the invoiceId with the payment
      break
    }
    default:
      console.log('Unhandled event:', event)
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})
</script>

<template>
  <iframe
    width="100%"
    height="100%"
    src="https://embed.bitrefill.com/?paymentMethods=lightning&showPaymentInfo=true&utm_source=bitrefill_demo"
    sandbox="allow-same-origin allow-popups allow-scripts allow-forms"
  />
</template>
