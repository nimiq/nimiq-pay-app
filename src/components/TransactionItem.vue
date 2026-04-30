<script setup lang="ts">
import type { PropType } from 'vue'
import type { ExternalTransaction } from '@/types/transactions'
import { IonRippleEffect } from '@ionic/vue'
import { FormattableNumber } from '@nimiq/utils'
import { FiatAmount } from '@nimiq/vue3-components'
import { computed } from 'vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import { usePrice } from '@/composables/usePrice'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { Asset, assetToCrypto, assetToPaymentMethod } from '@/lib/assets'
import { isPaymentTx, isPendingAtomicSwapTransaction, MerchantCategory, PaymentMethod, Transfer, translateTransactionState, translateTransactionTitle } from '@/types/transactions'
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
const asset = computed(() => props.tx.asset || Asset.NIM)
const { fiat, crypto } = usePrice(props.tx.amount, {
  timestamp: timestamp.value,
  cryptoCurrency: computed(() => assetToCrypto(asset.value)),
  formatter: { isPayment: isPaymentTx(props.tx) },
})
const paymentMethod = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
    return tx.paymentMethod || assetToPaymentMethod(asset.value)

  return assetToPaymentMethod(asset.value)
})

const category = computed(() => {
  const { tx } = props
  if (tx.transfer === Transfer.UserPaymentToMerchant || tx.transfer === Transfer.UserPaymentToAtomicSwap)
    return tx.merchantCategory || MerchantCategory.Shop
  if (tx.transfer === Transfer.UserPayment && tx.senderType === Nimiq.AccountType.HTLC && tx.recipientType === Nimiq.AccountType.Basic)
    return 'withdraw'
  if (tx.transfer === Transfer.UserReceipt)
    return 'deposit'

  return MerchantCategory.Shop
})

const hasSettledListAppearance = computed(() => ['included', 'mined', 'confirmed'].includes(props.tx.status))
const isSwapPending = computed(() => isPendingAtomicSwapTransaction(props.tx))
</script>

<template>
  <button :aria-label="`Transaction ${asset}`" class="w-full flex items-center text-[15px] gap-x-3 font-semibold py-3 rounded ion-activatable ripple-parent relative overflow-hidden" :class="{ 'opacity-60': !hasSettledListAppearance, 'line-through': tx.meta?.refunded, 'opacity-30': tx.meta?.hidden }">
    <CategoryIcon :category="category" />
    <div class="flex flex-col items-start gap-1">
      <h3 class="text-base font-semibold">
        {{ translateTransactionTitle(tx.title) }}
      </h3>
      <div class="flex items-center text-sm font-semibold leading-none gap-x-2">
        <time v-if="timestamp" class="text-space/50 tabular-nums text-nowrap">{{ relativeTime }} </time>
        <span v-if="isSwapPending" class="italic text-pumpkin/90">
          {{ $t('Pending') }}
        </span>
        <span v-else-if="!hasSettledListAppearance" class="italic text-pumpkin/90">
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
        <CryptoAmount :amount="crypto.totalUnits" :currency="crypto.currency" />
      </time>
    </div>
    <IonRippleEffect />
  </button>
</template>
