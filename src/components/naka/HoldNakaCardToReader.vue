<script setup lang="ts">
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { HCESdk } from 'capacitor-monetplus-hce'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import NfcPos from '@/components/icons/nfc-pos.vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerWebSocket } from '@/lib/issuer-websocket'
import { useNaka } from '@/stores/naka'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Rail, Transfer } from '@/types/transactions'
import Check from '../icons/check.vue'

const props = defineProps({ isVisible: Boolean })
const emit = defineEmits(stepEmits)
const { card, isCardActive, isCardActiveOnDevice } = storeToRefs(useNaka())

const { remoteBalance } = storeToRefs(useRemoteSigner())

const { isReady, paymentRequest, confirmPayment, rejectPayment, paymentRejection/* , triggerPayment */ } = useIssuerWebSocket()

const paymentSuccessful = ref(false)

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
      confirmPayment: async (serializedTx: string) => {
        await confirmPayment(request.id, request.rail, serializedTx)
        // Trigger payment success animation
        paymentSuccessful.value = true
        // Delay closing to let payment animation finish and have an impact
        await new Promise(resolve => setTimeout(resolve, 1500))
      },
    })
    return
  }

  // TODO: Sanity check applied exchange rate(s) (must compare rate from USDT to NIM) (can try to compare rates from merchant's currency to USDT)

  data.meta = {
    requireUserConfirmation: false,
  }
  emit('done', {
    request: data,
    confirmPayment: async (serializedTx: string) => {
      await confirmPayment(request.id, request.rail, serializedTx)
      // Trigger payment success animation
      paymentSuccessful.value = true
      // Delay closing to let payment animation finish and have an impact
      await new Promise(resolve => setTimeout(resolve, 1500))
    },
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

watch(() => props.isVisible, async (isVisible) => {
  if (isVisible && isCardActive.value && isCardActiveOnDevice.value) {
    // TODO: show error message if this fails
    await HCESdk.setAsPreferredService()
  }
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col items-center w-full h-full relative">
    <template v-if="card">
      <NakaCard
        class="w-full h-auto will-change-transform transition-transform ease-in-out duration-150 z-10"
        :class="{ 'translate-y-32': paymentSuccessful }"
        :card-data="card ? { maskedPan: card.maskedPan, expiry: `${card.expiry.month}/${card.expiry.year.toString(10).substring(2, 4)}` } : undefined"
        reduced-layout
      />
      <div class="w-full absolute left-0 top-2">
        <div
          class="w-[74px] h-[74px] mx-auto rounded-full bg-algae p-5 shadow-md will-change-transform transition-transform ease-[cubic-bezier(0.34,1.56,0.64,1)] duration-200 delay-200"
          :class="{ 'scale-0': !paymentSuccessful }"
        >
          <Check class="text-white" />
        </div>
      </div>
      <div class="mt-20 font-bold text-lg transition-opacity duration-200" :class="{ 'opacity-0': paymentSuccessful }">
        <div class="w-16 h-16 mx-auto mb-3 relative">
          <svg
            class="w-16 h-16 absolute animate-spin text-sky transition-opacity"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            :class="{ 'opacity-0': isReady }"
          >
            <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="3.5" stroke-dasharray="128" />
          </svg>
          <NfcPos class="w-16 h-16 absolute transition-opacity" :class="{ 'opacity-0': !isReady || card.statusId !== 'ACTIVE' }" />
        </div>
        <template v-if="isReady">
          <span v-if="isCardActive && isCardActiveOnDevice" class="text-sky">
            {{ $t('Hold your phone near the terminal') }}
          </span>
          <span v-else class="text-tomato">
            {{ $t('No active card') }}
          </span>
        </template>
      </div>
    </template>
    <div v-else class="mt-20 font-bold text-lg text-neutral-500">
      {{ $t('No NAKA card found') }}
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
