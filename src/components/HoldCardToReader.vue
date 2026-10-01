<script setup lang="ts">
import { motion } from 'motion-v'
import Check from '@/components/icons/check.vue'
import NfcCrossed from '@/components/icons/nfc-crossed.vue'
import NfcPos from '@/components/icons/nfc-pos.vue'
import PaymentCard from '@/components/PaymentCard.vue'

// Tap-to-pay screen: shows the card and the NFC state. The caller owns NFC checks and payment handling.
defineProps<{
  card?: { maskedPan: string, expiry: string }
  isReady: boolean
  isCardActive: boolean
  isNfcSupported: boolean | null
  isNfcEnabled: boolean | null
  paymentSuccessful?: boolean
}>()

const emit = defineEmits<{ (e: 'enableNfc'): void }>()
</script>

<template>
  <div class="flex flex-col items-center w-full h-full relative">
    <template v-if="card">
      <PaymentCard
        class="w-full h-auto will-change-transform transition-transform ease-in-out duration-150 z-10"
        :class="{ 'translate-y-32': paymentSuccessful }"
        :card-data="card"
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
            v-if="!isReady || !isCardActive"
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
          <span v-if="isCardActive && isNfcEnabled" class="text-sky text-balance">
            {{ $t('Hold your phone near the terminal') }}
          </span>
          <span v-else-if="!isNfcSupported" class="text-tomato">
            {{ $t('NFC is not supported on this device') }}
          </span>
          <IonButton
            v-else-if="!isNfcEnabled"
            class="mt-4 normal-case font-bold text-sm"
            style="--padding-top: 6px; --padding-bottom: 6px; --padding-start: 16px; --padding-end: 16px"
            @click="emit('enableNfc')"
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
      {{ $t('No card found') }}
    </div>
  </div>
</template>
