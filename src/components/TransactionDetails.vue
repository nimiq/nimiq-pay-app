<script setup lang="ts">
import { type PropType, computed, ref } from 'vue'
import { Clipboard } from '@capacitor/clipboard'
import TransactionAmounts from './TransactionAmounts.vue'
import { type ExternalTransaction, PaymentMethod, Transfer, translateTransactionState } from '@/types/transactions'
import { useFormatTime } from '@/composables/useTime'
import { usePrice } from '@/composables/usePrice'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, tx: { type: Object as PropType<ExternalTransaction>, required: true } })

const datetime = computed(() => useFormatTime(props.tx.timestamp))
// TODO: Get the map info from crypto map API
// const showMap = computed(() => props.tx.transfer === Transfer.UserPaymentToMerchant)
const showMap = ref(false)

const { crypto, fiat } = usePrice(props.tx.amount)
const { setToast } = useToast()

async function handleCopy(string: string) {
  await Clipboard.write({
    string,
  })
  await setToast({ message: i18n.t('Copied to clipboard') })
}
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full gap-10 mt-8">
    <TransactionAmounts :crypto-total="crypto.total" :fiat-formatted="fiat.formatted" :payment-method="tx.paymentMethod || PaymentMethod.NIM" />

    <div v-if="showMap" class="grid w-[calc(100vw-18px)] border rounded-md border-space/10">
      <!-- TODO Replace the box below this with the map -->
      <div class="bg-space/[0.06] grid place-content-center text-space font-bold font-mono h-60">
        🚧 Map Preview 🚧
      </div>
    </div>

    <div
      v-if="tx"
      class="grid justify-between w-full grid-cols-[1fr,1fr] gap-y-4  text-space/60 text-lg [&>*:nth-child(even)]:text-right"
    >
      <div>{{ $t('Status') }}</div>
      <div class="capitalize" @click="() => handleCopy(tx.hash)">
        {{ translateTransactionState(tx.status) }}
      </div>

      <div>{{ $t('Date') }}</div>
      <div>{{ datetime }}</div>

      <!-- Only display first 4 and last 4 characters -->
      <div v-if="tx.title === 'Withdrawal'">
        {{ $t('Recipient') }}
      </div>
      <div v-if="tx.title === 'Withdrawal'" @click="() => handleCopy(tx.recipient)">
        {{ tx.recipient.slice(0, 4) }}...{{ tx.recipient.slice(-4) }}
      </div>

      <!-- TODO Add the geo location name -->
    </div>
  </div>
</template>
