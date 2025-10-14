<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { IonButton } from '@ionic/vue'
import { ValidationUtils } from '@nimiq/utils'
import { FiatAmount } from '@nimiq/vue3-components'
import { storeToRefs } from 'pinia'

import { computed, ref, toRef, watch } from 'vue'
import AmountInput from '@/components/AmountInput.vue'
import CryptoAmount from '@/components/CryptoAmount.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
import TriangleIcon from '@/components/icons/triangle.vue'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useLogger } from '@/composables/useLogger'
import { i18n } from '@/i18n/i18n-setup'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits, StepName } from '@/lib/flows/steps.types'
import { Crypto, DECIMALS, useApp } from '@/stores/app'
import { useLocks } from '@/stores/locks'
import { useNimiqNetwork } from '@/stores/nimiq-network'
import { useRemoteSigner } from '@/stores/remote-signer'
import ShortAddressDisplay from './ShortAddressDisplay.vue'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })

const emit = defineEmits(stepEmits)

const logger = useLogger('NimWithdraw')

const state = toRef(props, 'state')
const { withdrawalAddress, selectedFiat } = storeToRefs(useApp())
const address = computed(() => {
  const address = withdrawalAddress.value || state.value[StepName.NimAddressInput]
  if (!address)
    return ''

  try {
    return Nimiq.Address.fromString(address).toUserFriendlyAddress()
  }
  catch (e) {
    logger.error('Invalid address:', address, e)
    return ''
  }
})

const { height, consensus } = storeToRefs(useNimiqNetwork())
const { isScannerActive } = storeToRefs(useLocks())
const { isRemoteOk, isHtlcActive, remoteBalance, hasHtlcExpired } = storeToRefs(useRemoteSigner())

const { data, fetch } = useFetch(() => useCurrencyPriceApi().getPriceNow({ currency: Crypto.NIM }))
watch(height, fetch)
const price = computed(() => data.value?.price || 0)

// This component allows the user to either withdraw a specific Fiat amount or all available funds.
// For a successful full withdrawal, it's crucial to know the user's exact fund balance.
// The precision of the set Fiat value directly impacts the accuracy of the fund calculation.
const fiatDecimals = 6

const fiatAmount = ref(0)
// TODO: replace comma with dot
const fiatAmountModel = ref(0)
watch(fiatAmount, () => fiatAmountModel.value = Math.floor(fiatAmount.value * 10 ** fiatDecimals))
watch(fiatAmountModel, () => fiatAmount.value = fiatAmountModel.value / 10 ** fiatDecimals)

// JS and their precision issues...
// Lunas are integers, so no problem in rounding down to the nearest integer.
const lunaAmount = computed(() => Math.floor(fiatAmount.value / price.value * 1e5))
const hasEnoughAmount = computed(() => lunaAmount.value <= remoteBalance.value)
const remoteBalanceFiat = computed(() => remoteBalance.value / 1e5 * price.value)

const selected = ref('')

watch(address, () => {
  selected.value = address.value
}, { immediate: true })

watch(selected, (value) => {
  if (value === 'nim')
    emit('done', '')
  else if (value === 'cc')
    emit('done', '')

  if (ValidationUtils.isValidAddress(value))
    selected.value = Nimiq.Address.fromString(value).toUserFriendlyAddress()
  else
    selected.value = address.value
})

const errorMessage = computed(() => {
  if (props.errorMsg)
    return props.errorMsg
  // If the HTLC has expired, we need to wait for consensus before withdrawing because the server cannot access to the funds anymore, only the user.
  if (hasHtlcExpired.value && consensus.value !== 'established')
    return i18n.t('Wait for consensus before withdrawing')
  if (!isRemoteOk.value && !hasHtlcExpired.value)
    return i18n.t('Server not available')
  if (!hasEnoughAmount.value && lunaAmount.value > 0)
    return i18n.t('Insufficient funds')
  return ''
})
const disabled = computed(() => !selected.value || lunaAmount.value <= 0 || !hasEnoughAmount.value || (!isRemoteOk.value && !isHtlcActive.value) || (hasHtlcExpired.value && consensus.value !== 'established'))
const loading = ref(false)

function withdraw() {
  if (loading.value)
    return

  loading.value = true
  useApp().addNewWithdrawalAddress(selected.value)
  emit('done', { amount: lunaAmount.value, recipient: selected.value })
}

watch(errorMessage, (value) => {
  if (value)
    loading.value = false
  logger.error('Error message when trying to withdraw:', value)
})
</script>

<template>
  <div v-if="!isScannerActive" class="h-full flex flex-1 flex-col">
    <div class="flex flex-col items-center justify-center w-full mt-6 mb-16 gap-y-2">
      <AmountInput v-model="fiatAmountModel" :decimals="fiatDecimals" />
      <p class="max-w-full text-base font-semibold text-space/60">
        <CryptoAmount :amount="lunaAmount" :currency="Crypto.NIM" :min-decimals="DECIMALS.NIM" />
      </p>
    </div>

    <div
      class="grid grid-cols-[auto_1fr_auto] items-center w-max mx-auto p-3 px-4 font-semibold border-[1.5px] border-solid rounded-md border-space-space-400"
      :aria-label="$t('Select withdrawal address')"
      @click="initializeFlow(FlowName.AddressSelection, { height: 'h-max', isOnTop: true })"
    >
      <ShortAddressDisplay v-if="selected" :address="selected" class="text-lg" />
      <div v-else class="text-lg text-space flex items-center gap-x-4">
        <NimiqLogo class="w-8" />
        <span>
          {{ $t('Select an address…') }}
        </span>
      </div>
      <TriangleIcon class="h-[10px] ml-4 text-space/30" />
    </div>

    <span class="my-8 text-center text-pumpkin">{{ errorMessage }}</span>

    <div class="flex w-full mt-auto mb-4 justify-evenly">
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 25">
        <FiatAmount :amount="25" :currency="selectedFiat" hide-decimals />
      </button>
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 50">
        <FiatAmount :amount="50" :currency="selectedFiat" hide-decimals />
      </button>
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 100">
        <FiatAmount :amount="100" :currency="selectedFiat" hide-decimals />
      </button>
      <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = remoteBalanceFiat">
        {{ $t('All') }}
      </button>
    </div>

    <div class="flex flex-col justify-center w-full pb-6">
      <IonButton size="small" class="text-base font-bold [&_ion-spinner]:h-4" :disabled="disabled" @click="withdraw">
        <Transition
          mode="out-in"
          name="slide-fade"
        >
          <LoadingSpinner v-if="loading" class="w-4 h-4 m-auto text-white" />
          <span v-else>{{ $t('Send') }}</span>
        </Transition>
      </IonButton>
    </div>
  </div>
</template>
