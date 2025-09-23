<script setup lang="ts">
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { HCESdk } from 'capacitor-monetplus-hce'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerWebSocket } from '@/lib/issuer-websocket'
import { useNaka } from '@/stores/naka'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Rail, Transfer } from '@/types/transactions'

const emit = defineEmits(stepEmits)

const { card } = useNaka()

const { remoteBalance } = storeToRefs(useRemoteSigner())

const { isReady, paymentRequest, confirmPayment, rejectPayment, paymentRejection/* , triggerPayment */ } = useIssuerWebSocket()

watch(paymentRequest, (request) => {
  if (!request)
    return

  // Verify card signature
  const cardSignature = request.signatures?.card
  if (!cardSignature) {
    rejectPayment(request.id, request.rail, 'INVALID_REQUEST', 'Card signature is missing')
    return
  }
  // TODO: Parse signature (it's a 0x-prefixed hex string) and verify it against the card's public key (maybe the Monet+ SDK can do that)

  // TODO: Compare request.amount with the user's per-tx limit

  // TODO: Compare request.amount with the user's daily limit, which requires listing the user's naka-card txs for the current day

  // Compare request.amount with the available balance
  if (Number.parseInt(request.amount, 10) > remoteBalance.value) {
    rejectPayment(request.id, request.rail, 'INSUFFICIENT_BALANCE')
    useToast().setToast({
      type: 'error',
      message: 'Insufficient balance',
    })
    return
  }

  // Find first non-USDT additional amount (USDT is the gateway currency, not the merchant currency)
  const invoiced = request.additionalAmounts?.find(({ currency }) => currency !== 'USDT')
  const data: PaymentRequestData = {
    recipient: request.recipient,
    amount: Number(request.amount),
    merchantName: request.store?.name,
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
    transfer: Transfer.UserPaymentToMerchant,
    feeIncludedInAmount: true,
  }

  if (!request.skipUserConfirmation) {
    // Show payment confirmation dialog
    data.meta = {
      requireUserConfirmation: true,
    }
    emit('done', {
      request: data,
      confirmPayment: (serializedTx: string) => confirmPayment(request.id, request.rail, serializedTx),
    })
    return
  }

  // TODO: Sanity check applied exchange rate(s) (must compare rate from USDT to NIM) (can try to compare rates from merchant's currency to USDT)

  data.meta = {
    requireUserConfirmation: false,
  }
  emit('done', {
    request: data,
    confirmPayment: (serializedTx: string) => confirmPayment(request.id, request.rail, serializedTx),
  })
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

onMounted(() => {
  HCESdk.setAsPreferredService()
})
</script>

<template>
  <div class="flex flex-col items-center w-full h-full">
    <template v-if="card">
      <NakaCard class="w-full h-auto" />
      <div v-if="!isReady" class="mt-6 text-orange-400 font-semibold">
        {{ $t('Connecting to issuer server...') }}
      </div>
      <div v-else-if="card.statusId === 'ACTIVE'" class="mt-6 text-[#0075E1] opacity-60">
        {{ $t('Hold near the terminal to pay') }}
      </div>
    </template>
    <div v-else>
      No NAKA card found
    </div>

    <!-- div class="mt-auto mb-24 text-center">
      <button
        v-if="card && card.statusId === 'ACTIVE'"
        class="text-sm font-bold text-gray-400 border border-gray-400 border-solid px-3 py-1 rounded-full"
        @click="triggerPayment('NQ07 0000 0000 0000 0000 0000 0000 0000 0000', BigInt(100e5))"
      >
        Simulate NFC tap-to-pay (100 NIM)
      </button>
      <button
        v-if="card && card.statusId === 'ACTIVE'"
        class="text-sm font-bold mt-4 text-gray-400 border border-gray-400 border-solid px-3 py-1 rounded-full"
        @click="triggerPayment('NQ07 0000 0000 0000 0000 0000 0000 0000 0000', BigInt(remoteBalance + 1000e5))"
      >
        Simulate NFC tap-to-pay ({{ Math.floor(remoteBalance / 1e5 + 1000) }} NIM)
      </button>
    </div> -->
  </div>
</template>
