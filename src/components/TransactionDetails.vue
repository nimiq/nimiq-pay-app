<script setup lang="ts">
import { usePrice } from '@/composables/usePrice'
import { useFormatTime } from '@/composables/useTime'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { SQLQuery } from '@/lib/sql-queries'
import { useConn } from '@/stores/conn'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useSync } from '@/stores/sync'
import { type ExternalTransaction, PaymentMethod, Transfer, translateTransactionState } from '@/types/transactions'
import { Clipboard } from '@capacitor/clipboard'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeMount, type PropType, ref } from 'vue'
import { useCurrencyFormatter } from '../composables/useCurrencyFormatter'
import TransactionAmounts from './TransactionAmounts.vue'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, tx: { type: Object as PropType<ExternalTransaction>, required: true } })

const { consensus, height } = storeToRefs(useNimiqNetwork())
const { crypto, fiat } = usePrice(props.tx.amount, { timestamp: props.tx.timestamp })
const { setToast } = useToast()
const { query } = useConn()
const { updateSingleTransaction } = useSync()

const datetime = computed(() => props.tx.timestamp ? useFormatTime(props.tx.timestamp) : '')
const isSwapPending = computed(() => props.tx.transfer === Transfer.UserPaymentToAtomicSwap && !props.tx.meta?.secret && !props.tx.meta?.refunded && !props.tx.meta?.imported)
const swapTimeoutTime = computedAsync(async () => {
  if (isSwapPending.value) {
    return await query<number>(SQLQuery.GetSwapTimeoutTime, [props.tx.recipient], { single: true })
  }
})
const timeUntilTimeout = computed(() => {
  if (swapTimeoutTime.value && consensus.value === 'established' && height.value > 0) {
    // Convert timestamp to hours from now
    const hours = Math.floor((swapTimeoutTime.value - Date.now()) / 1000 / 60 / 60)
    if (hours > 48) {
      const days = Math.floor(hours / 24)
      return i18n.tc('This pending transaction will be automatically refunded if it is not completed within the next day | This pending transaction will be automatically refunded if it is not completed within the next {days} days', days, { days })
    }
    else {
      return i18n.tc('This pending transaction will be automatically refunded if it is not completed within the next hour | This pending transaction will be automatically refunded if it is not completed within the next {hours} hours', hours, { hours })
    }
  }
  return null
})
// TODO: Get the map info from crypto map API
// const showMap = computed(() => props.tx.transfer === Transfer.UserPaymentToMerchant)
const showMap = ref(false)

async function handleCopy(string: string) {
  await Clipboard.write({
    string,
  })
  await setToast({ message: i18n.t('Copied to clipboard') })
}

function formatInvoiced({ currency, amount }: { currency: string, amount: number }) {
  if (currency === 'BTC') {
    return `₿ ${amount}`
  }
  else {
    const { formatFiat } = useCurrencyFormatter()
    return formatFiat(amount, { currency })
  }
}

onBeforeMount(() => updateSingleTransaction(props.tx.hash))
</script>

<template>
  <div class="flex flex-col w-full h-full gap-10 py-8">
    <TransactionAmounts
      :crypto-total="crypto.totalUnits"
      :fiat-amount="fiat.total"
      :fiat-currency="fiat.currency"
      :payment-method="tx.paymentMethod || PaymentMethod.NIM"
      :refunded="tx.transfer === Transfer.UserPaymentToAtomicSwap && tx.meta?.refunded"
    >
      <template v-if="tx.invoiced" #invoiced>
        {{ formatInvoiced(tx.invoiced) }}
      </template>
    </TransactionAmounts>

    <div v-if="showMap" class="grid w-[calc(100vw-18px)] border rounded-md border-space/10">
      <!-- TODO Replace the box below this with the map -->
      <div class="bg-space/[0.06] grid place-content-center text-space font-bold font-mono h-60">
        🚧 Map Preview 🚧
      </div>
    </div>

    <div
      v-if="tx"
      class="grid justify-between w-full grid-cols-[auto,1fr] gap-y-4 text-space/60 text-lg [&>*:nth-child(even)]:text-right"
    >
      <div>{{ $t('Status') }}</div>
      <div class="capitalize" @click="() => handleCopy(tx.hash)">
        <template v-if="isSwapPending">
          {{ $t('Pending') }}
        </template>
        <template v-else-if="tx.transfer === Transfer.UserPaymentToAtomicSwap && tx.meta?.refunded">
          {{ $t('Refunded') }}
        </template>
        <template v-else>
          {{ translateTransactionState(tx.status) }}
        </template>
      </div>

      <div v-if="datetime">
        {{ $t('Date') }}
      </div>
      <div v-if="datetime">
        {{ datetime }}
      </div>

      <!-- Only display first 4 and last 4 characters -->
      <div v-if="tx.title === 'Withdrawal'">
        {{ $t('Recipient') }}
      </div>
      <div v-if="tx.title === 'Withdrawal'" @click="() => handleCopy(tx.recipient)">
        {{ tx.recipient.slice(0, 4) }}...{{ tx.recipient.slice(-4) }}
      </div>

      <div v-if="tx.meta?.secret" class="max-w-full col-span-2 text-lg text-space/60">
        {{ $t('Payment Secret') }}
        <div class="px-3 py-2 mt-2 -mx-3 font-mono break-words rounded-lg bg-space/5">
          {{ tx.meta.secret }}
        </div>
      </div>

      <!-- TODO Add the geo location name -->
    </div>
    <div v-if="isSwapPending" class="text-pumpkin mt-auto text-center">
      {{
        timeUntilTimeout || $t('This pending transaction will automatically be refunded if it is not completed before the time limit')
      }}
    </div>
  </div>
</template>
