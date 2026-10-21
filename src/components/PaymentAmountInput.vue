<script setup lang="ts">
import type { PropType } from 'vue'
import type { PaymentRequestData, State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { storeToRefs } from 'pinia'
import { computed, ref, toRef, watch } from 'vue'
import AmountInput from '@/components/AmountInput.vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import SwapVerticalIcon from '@/components/icons/swap-vertical.vue'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { useUsdtQuoteRefresh } from '@/composables/useUsdtQuoteRefresh'
import { i18n } from '@/i18n/i18n-setup'
import { Asset, assetToCrypto } from '@/lib/assets'
import { stepEmits, StepName } from '@/lib/flows/steps.types'
import { roundUpToTwoDecimals } from '@/lib/utils'
import { DECIMALS, Fiat, useApp } from '@/stores/app'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'
import PolygonWarning from './PolygonWarning.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  isActive: { type: Boolean, default: false },
  state: { type: Object as PropType<State>, required: true },
})

const emit = defineEmits(stepEmits)

const logger = useLogger('PaymentAmountInput')

const state = toRef(props, 'state')

const payment = computed<PaymentRequestData>(() =>
  typeof state.value[StepName.QRCodeScanner] === 'object'
    ? state.value[StepName.QRCodeScanner]
    : { amount: 0, fee: 0, recipient: '', transfer: Transfer.UserPayment },
)

const asset = computed(() => payment.value.asset || Asset.NIM)
const isNimiqAsset = computed(() => asset.value === Asset.NIM)
const cryptoCurrency = computed(() => assetToCrypto(asset.value))

const { height } = storeToRefs(useNimiqNetwork())
const { selectedFiat } = storeToRefs(useApp())
const { remoteBalance } = storeToRefs(useRemoteSigner())
const polygonUsdt = usePolygonUsdt()
const { balance: usdtBalance, consensus: polygonConsensus } = storeToRefs(polygonUsdt)

// Fetch crypto price in USD and fiat exchange rate separately, then combine
// to get the price of 1 crypto coin in the user's selected fiat
const priceApi = useCurrencyPriceApi()
const { data: cryptoUsdPrice, fetch: fetchCryptoPrice } = useFetch(() => priceApi.getPriceNow({ currency: cryptoCurrency.value }))
const { data: fiatUsdPrice, fetch: fetchFiatPrice } = useFetch(() =>
  selectedFiat.value === Fiat.USD
    ? Promise.resolve({ data: { price: 1, currency: Fiat.USD, time: Math.round(Date.now() / 1e3), error: undefined as undefined }, hasError: false as const, error: undefined, status: 200 })
    : priceApi.getPriceNow({ currency: selectedFiat.value }),
)
function fetchPrices() {
  fetchCryptoPrice()
  fetchFiatPrice()
}
watch([cryptoCurrency, selectedFiat], fetchPrices)
watch(height, () => {
  if (height.value % 60 === 0)
    fetchPrices()
})
const price = computed(() => (cryptoUsdPrice.value?.price || 0) * (fiatUsdPrice.value?.price || 0))

// APP-169: the amount can be entered directly in the crypto unit (NIM/USDT) or in fiat. Crypto is the
// default; in crypto mode the entered minor-unit value is the source of truth, in fiat mode it is
// derived from the entered fiat value.
type Denomination = 'crypto' | 'fiat'
const denomination = ref<Denomination>('crypto')
const fiatDecimals = 2
// The entered crypto amount (luna) is the single source of truth; the fiat model is a synced view of
// it. Toggling denomination must NOT re-derive the amount — round-tripping through a cents-rounded
// fiat value drifts it lower on every toggle. Instead we keep both models in sync only on real edits
// and make the toggle a pure view switch.
const cryptoAmountModel = ref(0)
const fiatAmountModel = ref(0)

const factor = computed(() => 10 ** DECIMALS[cryptoCurrency.value])
const amountUnits = computed(() => cryptoAmountModel.value)
const hasPositiveAmount = computed(() => amountUnits.value > 0)

function onAmountInput(value: number) {
  if (denomination.value === 'crypto') {
    cryptoAmountModel.value = value
    if (price.value)
      fiatAmountModel.value = Math.floor(value / factor.value * price.value * 10 ** fiatDecimals)
  }
  else {
    fiatAmountModel.value = value
    if (price.value)
      cryptoAmountModel.value = Math.floor(value / 10 ** fiatDecimals / price.value * factor.value)
  }
}

function toggleDenomination() {
  denomination.value = denomination.value === 'crypto' ? 'fiat' : 'crypto'
}

// USDT quote
const loading = ref(false)
const currentUsdtQuoteRequest = computed<{
  amount: number
  recipient: string
  transfer: Transfer.UserPayment
} | null>(() => {
  // Flow keeps this step mounted while later steps are shown; stop quoting there so this step's poller
  // doesn't refill the shared fee snapshot the payment re-reads at submit time.
  if (!props.isActive || isNimiqAsset.value || polygonConsensus.value !== 'established' || !hasPositiveAmount.value || !payment.value.recipient)
    return null

  return {
    amount: amountUnits.value,
    recipient: payment.value.recipient,
    transfer: Transfer.UserPayment,
  }
})
const {
  quote: usdtQuote,
  error: usdtQuoteError,
  quoteLoading: usdtQuoteLoading,
  feeText: usdtFeeText,
} = useUsdtQuoteRefresh(currentUsdtQuoteRequest, loading, { autoRefresh: true })

// When Polygon fees are known, the helper amount should match the fee-inclusive total it describes.
const fiatEquivalent = computed(() => {
  if (price.value <= 0)
    return null
  const units = !isNimiqAsset.value && usdtQuote.value ? usdtQuote.value.totalDebit : amountUnits.value
  return roundUpToTwoDecimals(units / factor.value * price.value)
})

// Balance check
const spendableBalance = computed(() => isNimiqAsset.value ? remoteBalance.value : usdtBalance.value)
const hasEnoughAmount = computed(() => {
  if (!isNimiqAsset.value)
    return !!usdtQuote.value && usdtQuote.value.totalDebit <= spendableBalance.value
  return amountUnits.value <= spendableBalance.value
})

// Fee in fiat (convert USDT fee units → fiat using price)
const feeInFiat = computed(() => {
  if (!usdtQuote.value?.fee || !price.value)
    return null
  return roundUpToTwoDecimals(usdtQuote.value.fee / factor.value * price.value)
})

// Error message
const errorMessage = computed(() => {
  if (props.errorMsg)
    return props.errorMsg
  if (!isNimiqAsset.value && polygonConsensus.value !== 'established')
    return i18n.t('Connecting to Polygon')
  if (!isNimiqAsset.value && usdtQuoteError.value)
    return usdtQuoteError.value
  if (!hasEnoughAmount.value && amountUnits.value > 0) {
    if (!isNimiqAsset.value && usdtQuoteLoading.value)
      return ''
    return isNimiqAsset.value
      ? i18n.t('Insufficient funds')
      : i18n.t('You don\'t have enough USDT to cover this payment plus Polygon fees.')
  }
  return ''
})

// Button state
const disabled = computed(() => {
  const baseDisabled = amountUnits.value <= 0 || !hasEnoughAmount.value
  if (!isNimiqAsset.value)
    return baseDisabled || polygonConsensus.value !== 'established'
  return baseDisabled
})

function handlePay() {
  if (loading.value)
    return

  // Also pauses the USDT quote refresh until Flow switches the active step.
  loading.value = true
  emit('done', amountUnits.value)
}

watch(errorMessage, (value) => {
  // A hidden step has no quote, and the payment debits the balance, so its errors are not the user's here.
  if (value && props.isActive) {
    loading.value = false
    logger.error('Error in payment amount input:', value)
  }
})

// Reset the spinner when the user comes back from a later step; the quote request resumes with a fresh fee.
watch(() => props.isActive, (active) => {
  if (active)
    loading.value = false
})
</script>

<template>
  <div class="h-full flex flex-1 flex-col">
    <p class="text-2xl text-space font-bold text-center mt-4 mb-4">
      {{ $t('Set an amount') }}
    </p>

    <div class="flex flex-col items-center justify-center w-full mb-16 gap-y-2">
      <AmountInput
        :key="denomination"
        :model-value="denomination === 'crypto' ? cryptoAmountModel : fiatAmountModel"
        :decimals="denomination === 'crypto' ? DECIMALS[cryptoCurrency] : fiatDecimals"
        :suffix="denomination === 'crypto' ? cryptoCurrency : selectedFiat"
        @update:model-value="onAmountInput"
      />
      <button
        type="button"
        data-testid="payment-denomination-toggle"
        class="flex items-center gap-x-2 px-2 py-2 min-h-[44px] max-w-full text-base font-semibold text-space/60 outline-0"
        :aria-label="$t('Enter amount in {currency}', { currency: denomination === 'crypto' ? selectedFiat : cryptoCurrency })"
        @click="toggleDenomination"
      >
        <span class="truncate">
          <template v-if="denomination === 'crypto'">
            <FiatAmount v-if="fiatEquivalent != null" :amount="fiatEquivalent" :currency="selectedFiat" />
            <span v-else>—</span>
          </template>
          <CryptoAmount v-else :amount="amountUnits" :currency="cryptoCurrency" />
        </span>
        <SwapVerticalIcon
          class="size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none opacity-70"
          :class="{ 'rotate-180': denomination === 'fiat' }"
        />
      </button>
      <p v-if="hasPositiveAmount && (feeInFiat != null || usdtFeeText)" class="max-w-full text-sm font-medium text-space/50">
        <i18n-t v-if="feeInFiat != null" keypath="incl. {fee} fees">
          <template #fee>
            <FiatAmount :amount="feeInFiat" :currency="selectedFiat" />
          </template>
        </i18n-t>
        <template v-else>
          {{ usdtFeeText }}
        </template>
      </p>
    </div>

    <span v-if="errorMessage" class="my-4 text-center text-pumpkin">{{ errorMessage }}</span>

    <div class="flex flex-col items-center w-full mt-auto pb-6">
      <PolygonWarning
        v-if="asset === Asset.USDT"
        class="mb-6"
        :message="$t('Always check if you\'re paying to a polygon-address, or your funds might be permanently lost!')"
        :tooltip-message="$t('The Pay app uses USDT on the Polygon network. Sending funds to a non-Polygon address could result in permanent loss.')"
      />

      <IonButton
        data-testid="payment-amount-input-pay"
        expand="block"
        class="w-full text-base font-bold [&_ion-spinner]:h-4"
        :disabled="disabled"
        @click="handlePay"
      >
        <Transition mode="out-in" name="slide-fade">
          <LoadingSpinner v-if="loading" class="w-4 h-4 m-auto text-white" />
          <span v-else>{{ $t('Continue and Pay') }}</span>
        </Transition>
      </IonButton>
    </div>
  </div>
</template>
