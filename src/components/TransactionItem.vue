<script setup lang="ts">
import type { PropType } from 'vue'
import { IonRippleEffect } from '@ionic/vue'
import { computed } from 'vue'
import CategoryIcon from './icons/categories/CategoryIcon.vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { type ExternalTransaction, Transfer, isPaymentTx, translateTransactionTitle } from '@/types/transactions'
import { usePrice } from '@/composables/usePrice'
import { PaymentMethod } from '@/types/database'

const props = defineProps({
  tx: {
    type: Object as PropType<ExternalTransaction>,
    required: true,
  },
})

const { formatted } = useRelativeTime({ timestamp: props.tx.timestamp })
const { fiat, crypto } = usePrice(props.tx.amount, { formatter: { isPayment: isPaymentTx(props.tx) } })
const paymentMethod = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant)
    return tx.paymentMethod || PaymentMethod.NIM

  return PaymentMethod.NIM
})
</script>

<template>
  <button class="w-full flex items-center text-[15px] gap-x-3 font-semibold py-3 rounded ion-activatable ripple-parent relative overflow-hidden" :class="{ 'opacity-60': tx.status !== 'mined' && tx.status !== 'confirmed' }">
    <CategoryIcon :category="tx.shopCategory" />
    <div class="flex flex-col items-start gap-1">
      <h3 class="text-base font-semibold">
        {{ translateTransactionTitle(tx.title) }}
      </h3>
      <div class="flex items-center text-sm font-semibold leading-none gap-x-2">
        <time class="text-space/50 tabular-nums">{{ formatted }} </time>
        <span v-if="tx.status !== 'mined' && tx.status !== 'confirmed'" class="italic text-pumpkin/90">{{ tx.status }}</span>
      </div>
    </div>
    <div class="flex flex-col items-end ml-auto gap-y-1">
      <span class="text-base font-bold">{{ fiat.formatted }}</span>
      <time v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-sm font-semibold leading-none uppercase text-space/50 tabular-nums">
        <CryptoCityLogo class="h-3 mr-1" />
        {{ crypto.total.toLocaleString() }}
      </time>
      <time v-else class="text-sm font-semibold leading-none uppercase text-space/50 tabular-nums">{{ crypto.total.toLocaleString() }} {{ paymentMethod }}</time>
    </div>
    <IonRippleEffect />
  </button>
</template>
