<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { FiatAmount } from '@nimiq/vue3-components'
import { getAddress } from 'ethers'
import { storeToRefs } from 'pinia'

import { computed, ref, watch } from 'vue'
import AmountInput from '@/components/AmountInput.vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
import SwapVerticalIcon from '@/components/icons/swap-vertical.vue'
import TriangleIcon from '@/components/icons/triangle.vue'
import UsdtLogo from '@/components/icons/usdt-logo.vue'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { isGenericPolygonQuoteErrorMessage, useUsdtQuoteRefresh } from '@/composables/useUsdtQuoteRefresh'
import { i18n } from '@/i18n/i18n-setup'
import { assetToCrypto, formatUsdtPreviewAmount } from '@/lib/assets'
import { isValidEthAddress } from '@/lib/ethereum'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'
import { DECIMALS, useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { usePolygonUsdt } from '@/stores/polygon-usdt'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Transfer } from '@/types/transactions'
import ShortAddressDisplay from './ShortAddressDisplay.vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, isVisible: { type: Boolean, default: false }, state: { type: Object as PropType<State>, required: true } })

const emit = defineEmits(stepEmits)

const logger = useLogger('NimWithdraw')

const { withdrawalAddress, selectedFiat, isNimiqAsset, activeAsset } = storeToRefs(useApp())

// APP-91: derive purely from `withdrawalAddress` — the previous ref + bidirectional watcher
// raced with the address-selection sub-flow finalize and sent to the wrong recipient.
const selected = computed(() => {
  const value = withdrawalAddress.value
  if (!value)
    return ''

  if (!isNimiqAsset.value)
    return isValidEthAddress(value) ? getAddress(value) : ''

  try {
    return Nimiq.Address.fromString(value).toUserFriendlyAddress()
  }
  catch (e) {
    logger.error('Invalid address:', value, e)
    return ''
  }
})

const selectedAlias = computed(() => selected.value ? useApp().getAlias(selected.value) ?? '' : '')

const { height, consensus } = storeToRefs(useNimiqNetwork())
const { isScannerActive } = storeToRefs(useLocks())
const { isRemoteOk, isHtlcActive, remoteBalance, hasHtlcExpired } = storeToRefs(useRemoteSigner())
const polygonUsdt = usePolygonUsdt()
const { balance: usdtBalance, consensus: polygonConsensus, transferFeeSnapshot } = storeToRefs(polygonUsdt)

const cryptoCurrency = computed(() => assetToCrypto(activeAsset.value))
const { data, fetch } = useFetch(() => useCurrencyPriceApi().getPriceNow({ currency: cryptoCurrency.value }))
watch([height, cryptoCurrency], fetch)
const price = computed(() => data.value?.price || 0)

// This component allows the user to either withdraw a specific Fiat amount or all available funds.
// For a successful full withdrawal, it's crucial to know the user's exact fund balance.
// The precision of the set Fiat value directly impacts the accuracy of the fund calculation.
const fiatDecimals = 6

const fiatAmount = ref(0)
// TODO: replace comma with dot
const fiatAmountModel = ref(0)
// APP-178: when the user taps "All" for NIM, send the exact integer luna balance instead of the
// fiat-derived amount. The fiat round-trip floors twice, which otherwise leaves dust behind.
const sendMaxNim = ref(false)
watch(fiatAmount, () => fiatAmountModel.value = Math.floor(fiatAmount.value * 10 ** fiatDecimals))
watch(fiatAmountModel, () => fiatAmount.value = fiatAmountModel.value / 10 ** fiatDecimals)

// APP-169: the user can enter the amount either in fiat or directly in the crypto unit (NIM/USDT).
// In crypto mode the entered minor-unit value (luna/USDT units) is the source of truth; in fiat mode
// it stays derived from the fiat value as before.
type Denomination = 'fiat' | 'crypto'
const denomination = ref<Denomination>('fiat')
const cryptoAmountModel = ref(0)

// JS and their precision issues...
// Lunas are integers, so no problem in rounding down to the nearest integer.
const factor = computed(() => 10 ** DECIMALS[cryptoCurrency.value])
const spendableBalance = computed(() => isNimiqAsset.value ? remoteBalance.value : usdtBalance.value)
const amountUnits = computed(() => {
  // APP-178/APP-169: "All" pins the exact integer luna balance, so no dust is left and the amount
  // stays valid regardless of the entry denomination or later price drift (avoids the double-tap).
  if (isNimiqAsset.value && sendMaxNim.value)
    return spendableBalance.value
  if (denomination.value === 'crypto')
    return cryptoAmountModel.value
  if (!price.value)
    return 0
  return Math.floor(fiatAmount.value / price.value * factor.value)
})
const displayedFiatAmount = computed(() =>
  denomination.value === 'crypto'
    ? (price.value ? amountUnits.value / factor.value * price.value : 0)
    : fiatAmount.value,
)
const loading = ref(false)
const remoteBalanceFiat = computed(() => spendableBalance.value / factor.value * price.value)
const hasPositiveAmount = computed(() => amountUnits.value > 0)
const currentUsdtQuoteRequest = computed<{
  amount: number
  recipient: string
  transfer: Transfer.UserPayment
} | null>(() => {
  if (isNimiqAsset.value || polygonConsensus.value !== 'established' || !selected.value || !hasPositiveAmount.value)
    return null

  return {
    amount: amountUnits.value,
    recipient: selected.value,
    transfer: Transfer.UserPayment,
  }
})

const {
  quote: usdtQuote,
  error: usdtQuoteError,
  quoteLoading: usdtQuoteLoading,
  feeText: usdtFeeText,
} = useUsdtQuoteRefresh(currentUsdtQuoteRequest, loading, { autoRefresh: true })

const formattedUsdtAmount = computed(() => {
  if (usdtQuote.value)
    return formatUsdtPreviewAmount(usdtQuote.value.totalDebit)
  if (!price.value)
    return '—'
  return formatUsdtPreviewAmount(amountUnits.value)
})
const hasEnoughAmount = computed(() => {
  if (!isNimiqAsset.value)
    return !!usdtQuote.value && usdtQuote.value.totalDebit <= spendableBalance.value
  return amountUnits.value <= spendableBalance.value
})
const quoteHelperMessage = computed(() => {
  if (isNimiqAsset.value)
    return ''

  if (!selected.value && hasPositiveAmount.value)
    return i18n.t('Select an address to calculate Polygon fee.')

  return usdtFeeText.value
})

const flowErrorMessage = computed(() => {
  if (usdtQuoteError.value && isGenericPolygonQuoteErrorMessage(props.errorMsg))
    return usdtQuoteError.value

  return props.errorMsg || ''
})

const errorMessage = computed(() => {
  if (flowErrorMessage.value)
    return flowErrorMessage.value
  if (!isNimiqAsset.value && polygonConsensus.value !== 'established')
    return i18n.t('Connecting to Polygon')
  if (!isNimiqAsset.value && !selected.value)
    return ''
  if (!isNimiqAsset.value && usdtQuoteError.value)
    return usdtQuoteError.value
  // If the HTLC has expired, we need to wait for consensus before withdrawing because the server cannot access to the funds anymore, only the user.
  if (hasHtlcExpired.value && consensus.value !== 'established')
    return i18n.t('Wait for consensus before withdrawing')
  if (!isRemoteOk.value && !hasHtlcExpired.value)
    return i18n.t('Server not available')
  if (!hasEnoughAmount.value && amountUnits.value > 0) {
    if (!isNimiqAsset.value && usdtQuoteLoading.value)
      return ''
    return isNimiqAsset.value
      ? i18n.t('Insufficient funds')
      : i18n.t('You don\'t have enough USDT to cover this withdrawal plus Polygon fees.')
  }
  return ''
})
const disabled = computed(() => {
  const baseDisabled = !selected.value || amountUnits.value <= 0 || !hasEnoughAmount.value

  if (!isNimiqAsset.value)
    return baseDisabled || polygonConsensus.value !== 'established'

  return baseDisabled || (!isRemoteOk.value && !isHtlcActive.value) || (hasHtlcExpired.value && consensus.value !== 'established')
})

function onAmountInput(value: number) {
  sendMaxNim.value = false
  if (denomination.value === 'crypto')
    cryptoAmountModel.value = value
  else
    fiatAmountModel.value = value
}

function toggleDenomination() {
  if (denomination.value === 'fiat') {
    cryptoAmountModel.value = amountUnits.value
    denomination.value = 'crypto'
  }
  else {
    fiatAmount.value = displayedFiatAmount.value
    denomination.value = 'fiat'
  }
}

function applyFiatPreset(value: number) {
  sendMaxNim.value = false
  fiatAmount.value = value
  if (denomination.value === 'crypto' && price.value)
    cryptoAmountModel.value = Math.floor(value / price.value * factor.value)
}

function withdraw() {
  if (loading.value)
    return

  loading.value = true
  useApp().addNewWithdrawalAddress(selected.value)
  emit('done', {
    amount: amountUnits.value,
    recipient: selected.value,
    fiatAmount: displayedFiatAmount.value,
    polygonQuote: usdtQuote.value || undefined,
  })
}

async function fillMaxAmount() {
  if (isNimiqAsset.value) {
    sendMaxNim.value = true
    fiatAmount.value = remoteBalanceFiat.value // display only; withdraw() sends the exact luna balance
    if (denomination.value === 'crypto')
      cryptoAmountModel.value = spendableBalance.value
    return
  }

  if (polygonConsensus.value !== 'established')
    return

  try {
    const maxSendableUnits = usdtQuote.value?.maxSendable
      ?? Math.max(
        usdtBalance.value - ((transferFeeSnapshot.value ?? await polygonUsdt.primeTransferFee()).fee || 0),
        0,
      )

    fiatAmount.value = maxSendableUnits / factor.value * price.value
    if (denomination.value === 'crypto')
      cryptoAmountModel.value = maxSendableUnits
  }
  catch (error) {
    logger.error('Failed to calculate max Polygon withdrawal amount', error)
    fiatAmount.value = remoteBalanceFiat.value
  }
}

watch(errorMessage, (value) => {
  if (value)
    loading.value = false
  logger.error('Error message when trying to withdraw:', value)
})

// Reset stuck spinner when user returns from confirm/PIN — also un-pauses USDT quote refresh.
watch(() => props.isVisible, (visible) => {
  if (visible)
    loading.value = false
})
</script>

<template>
  <div v-if="!isScannerActive" class="h-full flex flex-1 flex-col">
    <div class="flex flex-col items-center justify-center w-full mt-6 mb-16 gap-y-2">
      <AmountInput
        :key="denomination"
        :model-value="denomination === 'crypto' ? cryptoAmountModel : fiatAmountModel"
        :decimals="denomination === 'crypto' ? DECIMALS[cryptoCurrency] : fiatDecimals"
        :suffix="denomination === 'crypto' ? cryptoCurrency : undefined"
        @update:model-value="onAmountInput"
      />
      <button
        type="button"
        data-testid="nim-withdraw-denomination-toggle"
        class="flex items-center gap-x-2 px-2 py-2 min-h-[44px] max-w-full text-base font-semibold text-space/60 outline-0"
        :aria-label="$t('Enter amount in {currency}', { currency: denomination === 'fiat' ? cryptoCurrency : selectedFiat })"
        @click="toggleDenomination"
      >
        <span class="truncate">
          <FiatAmount v-if="denomination === 'crypto'" :amount="displayedFiatAmount" :currency="selectedFiat" />
          <template v-else>
            <CryptoAmount v-if="isNimiqAsset" :amount="amountUnits" :currency="cryptoCurrency" :min-decimals="DECIMALS.NIM" />
            <span v-else data-testid="nim-withdraw-usdt-amount">{{ formattedUsdtAmount }}</span>
          </template>
        </span>
        <SwapVerticalIcon
          class="size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none opacity-70"
          :class="{ 'rotate-180': denomination === 'crypto' }"
        />
      </button>
      <p v-if="quoteHelperMessage" data-testid="nim-withdraw-quote-helper" class="text-sm font-medium text-space/50">
        {{ quoteHelperMessage }}
      </p>
    </div>

    <div
      class="grid grid-cols-[auto_1fr_auto] items-center w-max min-w-60 max-w-full mx-auto p-3 px-4 font-semibold border-[1.5px] border-solid rounded-md border-space-space-400"
      aria-label="Select withdrawal address"
      @click="initializeFlow(FlowName.AddressSelection, { height: 'h-max', isOnTop: true })"
    >
      <ShortAddressDisplay v-if="selected" :address="selected" :alias="selectedAlias" class="text-lg" />
      <div v-else class="text-lg text-space flex items-center gap-x-4">
        <component :is="isNimiqAsset ? NimiqLogo : UsdtLogo" :class="isNimiqAsset ? 'w-8' : 'w-9'" />
        <span>
          {{ $t('Select an address…') }}
        </span>
      </div>
      <TriangleIcon class="h-[10px] ml-4 text-space/30 justify-self-end" />
    </div>

    <span class="my-8 text-center text-pumpkin">{{ errorMessage }}</span>

    <div class="flex w-full mt-auto mb-4 justify-evenly">
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="applyFiatPreset(25)">
        <FiatAmount :amount="25" :currency="selectedFiat" hide-decimals />
      </button>
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="applyFiatPreset(50)">
        <FiatAmount :amount="50" :currency="selectedFiat" hide-decimals />
      </button>
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="applyFiatPreset(100)">
        <FiatAmount :amount="100" :currency="selectedFiat" hide-decimals />
      </button>
      <button data-testid="nim-withdraw-max" class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="fillMaxAmount">
        {{ $t('All') }}
      </button>
    </div>

    <div class="flex flex-col justify-center w-full pb-6">
      <IonButton data-testid="nim-withdraw-submit" aria-label="Withdraw" size="small" class="text-base font-bold [&_ion-spinner]:h-4" :disabled="disabled" @click="withdraw">
        <Transition
          mode="out-in"
          name="slide-fade"
        >
          <LoadingSpinner v-if="loading" class="w-4 h-4 m-auto text-white" />
          <span v-else>{{ $t('Withdraw') }}</span>
        </Transition>
      </IonButton>
    </div>
  </div>
</template>
