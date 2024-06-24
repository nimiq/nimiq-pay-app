<script setup lang="ts">
import { onMounted } from 'vue'
import { useStringParser } from '../composables/useStringParser'
import { useToast } from '../composables/useToast'
import { i18n } from '../i18n/i18n-setup'
import { stepEmits } from '@/lib/flows/steps.types'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

// const props = defineProps()

const emit = defineEmits(stepEmits)

interface InvoiceCreated {
  event: 'invoice_created'
  invoiceId: string
  /** Includes 'lightning:' prefix */
  paymentUri: string
  paymentMethod: 'lightning'
  paymentAmount: number // In BTC
  paymentCurrency: 'BTC'
  /** Excludes 'lightning:' prefix */
  paymentAddress: string
}

interface PaymentIntent {
  event: 'payment_intent'
  invoiceId: string
  /** Includes 'lightning:' prefix */
  paymentUri: string
  paymentMethod: 'lightning'
  paymentAmount: number // In BTC
  paymentCurrency: 'BTC'
  /** Excludes 'lightning:' prefix */
  paymentAddress: string
}

interface InvoiceUpdate {
  event: 'invoice_update'
  invoiceId: string
  status:
  | 'payment_detected'
  | 'payment_confirmed'
  | 'expired'
  | 'refunded'
}

interface InvoiceComplete {
  event: 'invoice_complete'
  invoiceId: string
  deliveryStatus:
  | 'not_delivered'
  | 'all_delivered'
  | 'all_error'
  | 'partial_delivery"'
  refundNeeded: boolean
}

type BitrefillEvent = InvoiceCreated | PaymentIntent | InvoiceUpdate | InvoiceComplete

async function onMessage(e: MessageEvent) {
  if (e.origin !== 'https://embed.bitrefill.com')
    return

  let data: BitrefillEvent
  try {
    data = JSON.parse(e.data) as BitrefillEvent
  }
  catch (error: any) {
    throw new Error(`Failed to JSON-parse Bitrefill event data: ${error.message} - JSON: ${e.data}`)
  }

  console.log('Received Bitrefill event:', data) // eslint-disable-line no-console

  const { event } = data

  switch (event) {
    case 'payment_intent': {
      const {
        paymentUri,
      } = data
      // Pay the users invoice with the `paymentUri`
      const requestData = await useStringParser().getPaymentRequestData(paymentUri)
      if ('error' in requestData && requestData.error) {
        useToast().setToast({ message: requestData.error, type: 'error' })
        return
      }
      emit('done', requestData.data)
      break
    }
    case 'invoice_update': {
      const { status } = data
      const { setToast } = useToast()
      switch (status) {
        case 'payment_detected':
          setToast({
            message: i18n.t('Payment detected'),
            type: 'spinner',
          })
          break
        case 'payment_confirmed':
          setToast({
            message: i18n.t('Bitrefill payment confirmed'),
            type: 'success',
          })
          break
        case 'expired':
          setToast({
            message: i18n.t('Bitrefill offer expired'),
            type: 'error',
          })
          break
        case 'refunded':
          setToast({
            message: i18n.t('Bitrefill payment refunded'),
            type: 'warning',
          })
          break
      }
      break
    }
    default:
      console.error('Unhandled event:', event)
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})
</script>

<template>
  <iframe
    src="https://embed.bitrefill.com/?paymentMethods=lightning&showPaymentInfo=true&utm_source=bitrefill_demo"
    sandbox="allow-same-origin allow-popups allow-scripts allow-forms"
    class="-mx-8 w-[calc(100%+4rem)] h-full"
  />
</template>
