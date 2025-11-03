<script setup lang="ts">
import type { PaymentRequestData } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { until, useIntervalFn } from '@vueuse/core'
import { HCESdk } from 'capacitor-monetplus-hce'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import NfcPos from '@/components/icons/nfc-pos.vue'
import NakaCard from '@/components/naka/NakaCard.vue'
import { useDevice } from '@/composables/useDevice'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import { stepEmits } from '@/lib/flows/steps.types'
import { useIssuerWebSocket } from '@/lib/issuer-websocket'
import { useLocks } from '@/stores/locks'
import { useNaka } from '@/stores/naka'
import { useRemoteSigner } from '@/stores/remote-signer'
import { MerchantCategory, Rail, Transfer } from '@/types/transactions'
import Check from '../icons/check.vue'
import NfcCrossed from '../icons/nfc-crossed.vue'

const props = defineProps({ isVisible: Boolean })
const emit = defineEmits(stepEmits)

const logger = useLogger('HoldNakaCardToReader')

const { card, isCardActive, isCardActiveOnDevice } = storeToRefs(useNaka())
const { remoteBalance } = storeToRefs(useRemoteSigner())
const { isAppInBackground } = storeToRefs(useLocks())

const { isReady: isServerReady, paymentRequest, confirmPayment, rejectPayment, paymentRejection } = useIssuerWebSocket()

const isNfcSupported = ref<boolean | null>(null)
const isNfcEnabled = ref<boolean | null>(null)
const isReady = computed(() => isServerReady.value && isNfcSupported.value !== null && isNfcEnabled.value !== null && isCardActiveOnDevice.value)
const paymentSuccessful = ref(false)

watch(paymentRequest, (request) => {
  if (!request)
    return

  // Verify card signature
  const cardSignature = request.signatures?.card
  if (!cardSignature) {
    rejectPayment(request.id, request.rail, 'INVALID_SIGNATURE', 'Card signature is missing')
    return
  }
  // TODO: Parse signature (it's a 0x-prefixed hex string) and verify it against the card's public key (maybe the Monet+ SDK can do that)

  // TODO: Compare request.amount with the user's per-tx limit

  // TODO: Compare request.amount with the user's daily limit, which requires listing the user's naka-card txs for the current day

  // Compare request.amount with the available balance
  if (Number.parseInt(request.amount, 10) > remoteBalance.value) {
    rejectPayment(request.id, request.rail, 'INSUFFICIENT_BALANCE', 'Not enough balance')
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
    merchantCategory: MerchantCategory.Shop,
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

const { pause: stopNfcCheck, resume: startNfcCheck } = useIntervalFn(async () => {
  if (useDevice().isWeb) {
    isNfcSupported.value = false
    isNfcEnabled.value = false
    stopNfcCheck()
    return
  }
  // No need to check NFC status if we already know it's not supported
  if (!isNfcSupported.value) {
    try {
      const { isSupported } = await HCESdk.isNfcSupported()
      logger.log('NFC supported:', isSupported)
      isNfcSupported.value = isSupported
      if (!isSupported) {
        isNfcEnabled.value = false
        stopNfcCheck()
        return
      }
    }
    catch (error) {
      logger.warn('Failed to check for NFC support:', error)
      isNfcSupported.value = false
      isNfcEnabled.value = false
      stopNfcCheck()
      return
    }
  }
  const { isEnabled } = await HCESdk.isNfcEnabled()
  logger.log('NFC enabled:', isEnabled)
  isNfcEnabled.value = isEnabled
}, 1000, { immediate: false })

watch([() => props.isVisible, isCardActiveOnDevice], async ([isVisible, isCardActiveOnDevice]) => {
  if (isVisible && isCardActiveOnDevice)
    startNfcCheck()
  else
    stopNfcCheck()
}, { immediate: true })

watch([() => props.isVisible, isNfcEnabled, isCardActiveOnDevice], async ([isVisible, isNfcEnabled, isCardActiveOnDevice]) => {
  if (isVisible && isCardActive.value && isCardActiveOnDevice && isNfcEnabled) {
    // Need to wait until app is in foreground (not in background) or it will crash the app
    await until(isAppInBackground).toBe(false)
    logger.log('Setting app as preferred NFC service')
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
        <div class="w-16 h-16 mx-auto mb-4 relative">
          <motion.div
            v-if="!isReady || !isCardActive || !isCardActiveOnDevice"
            class="w-16 h-16 absolute"
            :initial="{ opacity: isReady ? 0 : 1 }"
            :animate="{ opacity: isReady ? 0 : 1 }"
            :transition="{ duration: 0.3 }"
          >
            <svg
              class="w-16 h-16 animate-spin text-sky"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="3.5" stroke-dasharray="128" />
            </svg>
          </motion.div>
          <motion.div
            v-if="isReady && !isNfcEnabled"
            class="size-16 absolute"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ duration: 0.3 }"
          >
            <NfcCrossed class="size-16 text-sky" />
          </motion.div>
          <motion.div
            v-if="isReady && isNfcEnabled"
            class="w-16 h-16 absolute"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ duration: 0.3 }"
          >
            <NfcPos class="w-16 h-16 text-sky" />
          </motion.div>
        </div>
        <template v-if="isReady">
          <span v-if="isCardActive && isCardActiveOnDevice && isNfcEnabled" class="text-sky text-balance">
            {{ $t('Hold your phone near the terminal') }}
          </span>
          <span v-else-if="!isNfcSupported" class="text-tomato">
            {{ $t('NFC is not supported on this device') }}
          </span>
          <IonButton
            v-else-if="!isNfcEnabled"
            class="mt-4 normal-case font-bold text-sm"
            style="--padding-top: 6px; --padding-bottom: 6px; --padding-start: 16px; --padding-end: 16px"
            @click="() => HCESdk.openNfcSettings()"
          >
            {{ $t('Enable NFC to pay') }}
          </IonButton>
          <span v-else class="text-tomato">
            {{ $t('No active card') }}
          </span>
        </template>
      </div>
    </template>
    <div v-else class="mt-20 font-bold text-lg text-neutral-500">
      {{ $t('No NAKA card found') }}
    </div>
  </div>
</template>
