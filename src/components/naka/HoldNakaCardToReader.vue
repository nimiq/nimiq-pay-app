<script setup lang="ts">
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import NakaCard from '@/components/icons/naka-card.vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { watch } from 'vue'
import { useToast } from '../../composables/useToast'
import { useIssuerWebSocket } from '../../lib/issuer-websocket'
import { NakaCardStatus, useNaka } from '../../stores/naka'
import { Rail, Transfer } from '../../types/transactions'

const emit = defineEmits(stepEmits)

const { card } = useNaka()

const { isReady, paymentRequest, confirmPayment: _0, rejectPayment: _1, paymentRejection, triggerPayment } = useIssuerWebSocket()

watch(paymentRequest, (request) => {
  if (!request)
    return

  // TODO: Instead of emitting to go to the payment preview, check payment conditions and confirm or reject payment here directly
  const invoiced = request.additionalAmounts?.[0]
  const data: PaymentRequestData = {
    recipient: request.recipient,
    amount: Number(request.amount),
    merchantName: request.merchant?.name,
    // merchantCategory: MerchantCategory.Shop,
    rail: Rail.NakaCard,
    paymentRef: request.id,
    fee: 0,
    invoiced: invoiced
      ? {
          amount: invoiced.amount / 10 ** invoiced.decimals,
          currency: invoiced.currency,
        }
      : undefined,
    // meta: {},
    transfer: Transfer.UserPaymentToMerchant,
    feeIncludedInAmount: true,
  }
  emit('done', data)
})

watch(paymentRejection, (rejection) => {
  if (!rejection)
    return
  useToast().setToast({
    type: 'error',
    // TODO: Map rejection reasons to user-friendly messages
    message: rejection,
  })
})
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <template v-if="card">
      <NakaCard class="w-full h-auto" />
      <div v-if="!isReady" class="mt-6 text-orange-400 font-semibold">
        {{ $t('Connecting to issuer server...') }}
      </div>
      <div v-else-if="card.statusId === NakaCardStatus.Active" class="mt-6 text-[#0075E1] opacity-60">
        {{ $t('Hold near the terminal to pay') }}
      </div>
    </template>
    <div v-else>
      No NAKA card found
    </div>
    <button
      v-if="card && card.statusId === NakaCardStatus.Active"
      class="mt-auto text-sm font-bold mb-24 text-gray-400 border border-gray-400 border-solid px-3 py-1 rounded-full"
      @click="triggerPayment('NQ07 0000 0000 0000 0000 0000 0000 0000 0000', BigInt(100e5))"
    >
      Simulate NFC tap-to-pay
    </button>
  </div>
</template>
