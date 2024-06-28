<script setup lang="ts">
import type { PropType } from 'vue'
import { usePrice } from '@/composables/usePrice'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { type ExternalTransaction, isPaymentTx, MerchantCategory, PaymentMethod, Transfer, translateTransactionState, translateTransactionTitle } from '@/types/transactions'
import { IonRippleEffect } from '@ionic/vue'
import { FormattableNumber } from '@nimiq/utils'
import { FiatAmount } from '@nimiq/vue3-components'
import { computed } from 'vue'
import CategoryIcon from './icons/categories/CategoryIcon.vue'
import CryptoCityLogo from './icons/cryptocity-logo.vue'

const props = defineProps({
  tx: {
    type: Object as PropType<ExternalTransaction>,
    required: true,
  },
})

const timestamp = computed(() => props.tx.timestamp)
const { formatted: relativeTime } = useRelativeTime({ timestamp })
const { fiat, crypto } = usePrice(props.tx.amount, { timestamp: timestamp.value, formatter: { isPayment: isPaymentTx(props.tx) } })
const paymentMethod = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
    return tx.paymentMethod || PaymentMethod.NIM

  return PaymentMethod.NIM
})

const category = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
    return tx.merchantCategory
  if (tx.transfer === Transfer.UserPayment && tx.senderType === Nimiq.AccountType.HTLC && tx.recipientType === Nimiq.AccountType.Basic)
    return 'withdraw'
  if (tx.transfer === Transfer.UserReceipt)
    return 'deposit'

  return MerchantCategory.Shop
})
</script>

<template>
  <button class="w-full flex items-center text-[15px] gap-x-3 font-semibold py-3 rounded ion-activatable ripple-parent relative overflow-hidden" :class="{ 'opacity-60': tx.status !== 'included' && tx.status !== 'confirmed', 'line-through': tx.transfer === Transfer.UserPaymentToAtomicSwap && tx.meta?.refunded }">
    <CategoryIcon :category="category" />
    <div class="flex flex-col items-start gap-1">
      <h3 class="text-base font-semibold">
        {{ translateTransactionTitle(tx.title) }}
      </h3>
      <div class="flex items-center text-sm font-semibold leading-none gap-x-2">
        <time v-if="timestamp" class="text-space/50 tabular-nums text-nowrap">{{ relativeTime }} </time>
        <span v-if="tx.transfer === Transfer.UserPaymentToAtomicSwap && !tx.meta?.secret && !tx.meta?.refunded && !tx.meta?.imported" class="italic text-pumpkin/90">
          {{ $t('Pending') }}
        </span>
        <span v-else-if="tx.status !== 'included' && tx.status !== 'confirmed'" class="italic text-pumpkin/90">
          {{ translateTransactionState(tx.status) }}
        </span>
      </div>
    </div>
    <div class="flex flex-col items-end ml-auto gap-y-1">
      <FiatAmount class="text-base font-bold" :amount="fiat.total" :currency="fiat.currency" />
      <time v-if="paymentMethod === PaymentMethod.Points" class="flex items-center text-sm font-semibold leading-none uppercase text-space/50 tabular-nums text-nowrap">
        <CryptoCityLogo class="h-3 mr-1" />
        {{ new FormattableNumber(crypto.total).toString({ maxDecimals: 2, useGrouping: true }) }}
      </time>
      <time v-else class="text-sm font-semibold leading-none uppercase text-space/50 tabular-nums text-nowrap">
        <!-- paymentMethod should only be 'nim' here, and does thus not need to be translated -->
        {{ crypto.formatted }}
      </time>
    </div>
    <IonRippleEffect />
  </button>
</template>
