<script setup lang="ts">
import type { PropType } from 'vue'
import type { ExternalTransaction } from '@/types/transactions'
import { Clipboard } from '@capacitor/clipboard'
import { Identicon } from '@nimiq/vue3-components'
import { computedAsync } from '@vueuse/core'
import { motion } from 'motion-v'
import { storeToRefs } from 'pinia'
import { computed, onBeforeMount, ref } from 'vue'
import AddressBookIcon from '@/components/icons/address-book.vue'
import UsdtLogo from '@/components/icons/usdt-logo.vue'
import { useLogger } from '@/composables/useLogger'
import { usePrice } from '@/composables/usePrice'
import { useFormatTime } from '@/composables/useTime'
import { useToast } from '@/composables/useToast'
import { i18n } from '@/i18n/i18n-setup'
import { Asset, assetToCrypto, assetToPaymentMethod, Chain } from '@/lib/assets'
import { initializeFlow } from '@/lib/flows'
import { FlowName } from '@/lib/flows/steps.types'
import { SQLQuery } from '@/lib/sql-queries'
import { useApp } from '@/stores/app'
import { useConn } from '@/stores/conn'
import { useLocalWallet } from '@/stores/local-wallet'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useSync } from '@/stores/sync'
import { getSwapHtlcKey } from '@/stores/transactions'
import { isHtlcRedeemToSelf, isPendingAtomicSwapTransaction, Transfer, translateTransactionState } from '@/types/transactions'
import { useCurrencyFormatter } from '../composables/useCurrencyFormatter'
import TransactionAmounts from './TransactionAmounts.vue'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, tx: { type: Object as PropType<ExternalTransaction>, required: true } })

const logger = useLogger('TransactionDetails')
const { consensus, height } = storeToRefs(useNimiqNetwork())
const app = useApp()
const asset = computed(() => props.tx.asset || Asset.NIM)
const recipientAlias = computed(() => props.tx.recipient ? app.getAlias(props.tx.recipient) : undefined)
// Incoming payment: sender is the counterparty; recipient is the user's own address (hidden).
const isIncoming = computed(() => props.tx.transfer === Transfer.UserReceipt
  || isHtlcRedeemToSelf(props.tx, useLocalWallet().localAddress.toUserFriendlyAddress()))
const senderAlias = computed(() => props.tx.sender ? app.getAlias(props.tx.sender) : undefined)
const isSenderSaved = computed(() => !!props.tx.sender && app.isSavedAddress(props.tx.sender))
// A small hop every 3s draws the eye to the "add to address book" affordance.
const jumpTransition = { duration: 0.45, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2.55 } as const
const chain = computed(() => props.tx.chain || Chain.Nimiq)
const paymentMethod = computed(() => props.tx.paymentMethod || assetToPaymentMethod(asset.value))
const { crypto, fiat } = usePrice(props.tx.amount, {
  timestamp: props.tx.timestamp,
  cryptoCurrency: computed(() => assetToCrypto(asset.value)),
})
const { setToast } = useToast()
const { query } = useConn()
const { updateSingleTransaction } = useSync()

const datetime = computed(() => props.tx.timestamp ? useFormatTime(props.tx.timestamp) : '')
const isSwapPending = computed(() => isPendingAtomicSwapTransaction(props.tx))
const swapTimeoutTime = computedAsync(async () => {
  if (isSwapPending.value) {
    return await query<number>(SQLQuery.GetSwapTimeoutTime, [getSwapHtlcKey(props.tx)], { single: true })
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
  try {
    await Clipboard.write({
      string,
    })
    await setToast({ message: i18n.t('Copied to clipboard') })
  }
  catch (error) {
    logger.error('Failed to copy to clipboard', error)
    await setToast({ message: i18n.t('Failed to copy to clipboard') })
  }
}

function handleAddToBook() {
  initializeFlow(FlowName.SaveAddress, {
    initialState: { qrCodeScanner: props.tx.sender },
    isOnTop: true,
    height: 'h-max',
  })
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

onBeforeMount(() => {
  if (asset.value === Asset.USDT || chain.value === Chain.Polygon) {
    usePolygonUsdt().updateSingleTransaction(props.tx.hash)
    return
  }

  updateSingleTransaction(props.tx.hash)
})
</script>

<template>
  <div class="flex flex-col w-full h-full gap-10 py-8">
    <TransactionAmounts
      :crypto-total="crypto.totalUnits"
      :crypto-currency="crypto.currency"
      :fiat-amount="fiat.total"
      :fiat-currency="fiat.currency"
      :payment-method="paymentMethod"
      :refunded="tx.meta?.refunded"
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
        <template v-else-if="tx.meta?.refunded">
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

      <div aria-label="Asset">
        {{ $t('Asset') }}
      </div>
      <div>{{ asset }}</div>

      <div aria-label="Network">
        {{ $t('Network') }}
      </div>
      <div>{{ chain }}</div>

      <!-- Only display first 4 and last 4 characters. For an incoming payment we show the
           sender (the counterparty); the recipient is the user's own address, so it's hidden. -->
      <template v-if="isIncoming && tx.sender">
        <div>{{ $t('Sender') }}</div>
        <div
          :aria-label="isSenderSaved ? 'Sender' : 'Add sender to address book'"
          class="flex items-center justify-end gap-x-2 cursor-pointer"
          @click="handleAddToBook"
        >
          <Identicon v-if="isSenderSaved && !tx.sender.startsWith('0x')" :address="tx.sender" class="size-6 shrink-0" />
          <UsdtLogo v-else-if="isSenderSaved" class="w-7 shrink-0" />
          <motion.div v-else class="shrink-0" :animate="app.showAnimations ? { y: [0, -4, 0] } : undefined" :transition="jumpTransition">
            <AddressBookIcon class="h-5 w-auto text-space/40" />
          </motion.div>
          <div class="flex flex-col items-end gap-y-0.5 min-w-0">
            <span v-if="senderAlias" class="font-semibold truncate max-w-full">{{ senderAlias }}</span>
            <span :class="senderAlias ? 'text-sm text-space/60' : ''">{{ tx.sender.slice(0, 4) }}...{{ tx.sender.slice(-4) }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="tx.recipient">
        <div>{{ $t('Recipient') }}</div>
        <div class="flex flex-col items-end gap-y-0.5" @click="() => handleCopy(tx.recipient)">
          <span v-if="recipientAlias" class="font-semibold truncate max-w-full">{{ recipientAlias }}</span>
          <span :class="recipientAlias ? 'text-sm text-space/60' : ''">{{ tx.recipient.slice(0, 4) }}...{{ tx.recipient.slice(-4) }}</span>
        </div>
      </template>

      <div v-if="tx.message?.trim()" class="max-w-full col-span-2 text-lg text-space/60">
        {{ $t('Message') }}
        <div class="px-3 py-2 mt-2 -mx-3 break-words rounded-lg bg-space/5 text-space">
          {{ tx.message }}
        </div>
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
