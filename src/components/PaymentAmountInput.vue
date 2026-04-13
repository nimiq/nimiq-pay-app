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
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { useUsdtQuoteRefresh } from '@/composables/useUsdtQuoteRefresh'
import { i18n } from '@/i18n/i18n-setup'
import { Asset, assetToCrypto, formatUsdtPreviewAmount } from '@/lib/assets'
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

// Fiat amount input
const fiatDecimals = 6
const fiatAmount = ref(0)
const fiatAmountModel = ref(0)
watch(fiatAmount, () => fiatAmountModel.value = Math.floor(fiatAmount.value * 10 ** fiatDecimals))
watch(fiatAmountModel, () => fiatAmount.value = fiatAmountModel.value / 10 ** fiatDecimals)

// Crypto conversion
const factor = computed(() => 10 ** DECIMALS[cryptoCurrency.value])
const amountUnits = computed(() => price.value > 0 ? Math.floor(fiatAmount.value / price.value * factor.value) : 0)
const hasPositiveAmount = computed(() => amountUnits.value > 0)

// USDT quote
const loading = ref(false)
const currentUsdtQuoteRequest = computed<{
  amount: number
  recipient: string
  transfer: Transfer.UserPayment
} | null>(() => {
  if (isNimiqAsset.value || polygonConsensus.value !== 'established' || !hasPositiveAmount.value || !payment.value.recipient)
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
} = useUsdtQuoteRefresh(currentUsdtQuoteRequest, loading, { autoRefresh: true })

// Displayed amount (in crypto units). For Nimiq, this is just the input amount. For USDT, this is the total debit amount from the quote (payment amount + fee).
const displayedAmountUnits = computed(() => !isNimiqAsset.value && usdtQuote.value ? usdtQuote.value.totalDebit : amountUnits.value)
const formattedUsdtAmount = computed(() => formatUsdtPreviewAmount(displayedAmountUnits.value))

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

  emit('done', amountUnits.value)
}

watch(errorMessage, (value) => {
  if (value) {
    loading.value = false
    logger.error('Error in payment amount input:', value)
  }
})
</script>

<template>
  <div class="h-full flex flex-1 flex-col">
    <p class="text-2xl text-space font-bold text-center mt-4 mb-4">
      {{ $t('Set an amount') }}
    </p>

    <div class="flex flex-col items-center justify-center w-full mb-16 gap-y-2">
      <AmountInput v-model="fiatAmountModel" :decimals="fiatDecimals" />
      <p class="max-w-full text-base font-semibold text-space/60">
        <template v-if="hasPositiveAmount">
          <CryptoAmount v-if="isNimiqAsset" :amount="displayedAmountUnits" :currency="cryptoCurrency" :min-decimals="DECIMALS.NIM" />
          <span v-else>{{ formattedUsdtAmount }}</span>
          <span v-if="feeInFiat != null"> &middot;
            <i18n-t keypath="incl. {fee} fees">
              <template #fee>
                <FiatAmount :amount="feeInFiat" :currency="selectedFiat" />
              </template>
            </i18n-t>
          </span>
          <span v-else-if="usdtQuoteLoading && !usdtQuote"> &middot; {{ $t('Calculating fees...') }}</span>
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
