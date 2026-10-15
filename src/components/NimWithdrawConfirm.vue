<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { Identicon } from '@nimiq/vue3-components'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import AddressDisplay from '@/components/AddressDisplay.vue'
import TransactionAmounts from '@/components/TransactionAmounts.vue'
import { useUsdtQuoteRefresh } from '@/composables/useUsdtQuoteRefresh'
import { assetToCrypto, formatUsdtAmount } from '@/lib/assets'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { useApp } from '@/stores/app'
import { Transfer } from '@/types/transactions'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  state: { type: Object as PropType<State>, required: true },
  errorMsg: { type: String },
  isVisible: { type: Boolean, default: false },
})

const emit = defineEmits(stepEmits)

const { activeAsset, isNimiqAsset, selectedFiat } = storeToRefs(useApp())
const cryptoCurrency = computed(() => assetToCrypto(activeAsset.value))

const selection = computed(() => props.state[StepName.NimWithdrawalAmountSelectionStep])
const recipient = computed(() => selection.value?.recipient ?? '')
const fiatAmount = computed(() => selection.value?.fiatAmount ?? 0)

const loading = ref(false)
const usdtQuoteRequest = computed(() => {
  if (isNimiqAsset.value || !selection.value?.recipient || !selection.value.amount)
    return null
  return { amount: selection.value.amount, recipient: selection.value.recipient, transfer: Transfer.UserPayment as const }
})
// Keep the fee shown here live: the quote confirmed on this screen is the one signed after the PIN step,
// and a "fee changed" failure there sends the user back here to review the new fee.
const { quote: liveQuote, refresh: refreshUsdtQuote } = useUsdtQuoteRefresh(usdtQuoteRequest, loading, { autoRefresh: true })
const polygonQuote = computed(() => liveQuote.value ?? selection.value?.polygonQuote)

// USDT path shows totalDebit (amount + fee) so the user sees exactly what leaves their wallet;
// NIM uses a hardcoded fee of 0 in the flow's onDone, so the gross amount is the total.
const cryptoTotal = computed(() => {
  if (isNimiqAsset.value)
    return selection.value?.amount ?? 0
  return polygonQuote.value?.totalDebit ?? selection.value?.amount ?? 0
})

const usdtFee = computed(() => polygonQuote.value?.fee ?? 0)
const formattedUsdtFee = computed(() => formatUsdtAmount(usdtFee.value))

watch(() => props.errorMsg, (message) => {
  if (message)
    loading.value = false
})

// A failure on the PIN step puts its error there; reset when the user comes back and fetch the current fee.
watch(() => props.isVisible, (visible) => {
  if (!visible || !loading.value)
    return
  loading.value = false
  void refreshUsdtQuote()
})

function confirm() {
  if (loading.value)
    return
  loading.value = true
  emit('done', { polygonQuote: polygonQuote.value })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <TransactionAmounts
      class="mt-6"
      :crypto-total="cryptoTotal"
      :crypto-currency="cryptoCurrency"
      :fiat-amount="fiatAmount"
      :fiat-currency="selectedFiat"
    >
      <template v-if="!isNimiqAsset && usdtFee > 0" #crypto-after>
        <i18n-t keypath="incl. {fee} fees">
          <template #fee>
            {{ formattedUsdtFee }}
          </template>
        </i18n-t>
      </template>
    </TransactionAmounts>

    <section class="flex flex-1 flex-col items-center justify-center gap-y-8">
      <Identicon v-if="isNimiqAsset" :address="recipient" class="size-20 tall:size-32" aria-hidden="true" />
      <AddressDisplay
        :address="recipient"
        :format="isNimiqAsset ? 'nimiq' : 'ethereum'"
        :class="isNimiqAsset ? 'max-w-64' : 'max-w-min !px-5'"
      />
    </section>

    <span v-if="errorMsg" class="mb-4 text-center text-pumpkin">{{ errorMsg }}</span>

    <IonButton
      data-testid="nim-withdraw-confirm"
      aria-label="Confirm and send"
      expand="block"
      class="w-full text-base font-bold mb-6"
      :disabled="!recipient || loading"
      @click="confirm"
    >
      {{ $t('Confirm and send') }}
    </IonButton>
  </div>
</template>
