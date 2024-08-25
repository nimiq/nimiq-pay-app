<script setup lang="ts">
import { type PropType, computed, ref, toRef, watch } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'radix-vue'
import { chevronDown, chevronForward } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { ValidationUtils } from '@nimiq/utils'
import { type State, StepName, stepEmits } from '@/lib/flows/steps.types'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Crypto, useApp } from '@/stores/app'
import AmountInput from '@/components/AmountInput.vue'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
import LoadingSpinner from '@/components/icons/loading-spinner.vue'
import TriangleIcon from '@/components/icons/triangle.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { i18n } from '@/i18n/i18n-setup'
import { useCurrencyPriceApi, useFetch } from '@/composables/useApi'
import { useNimiqNetwork } from '@/stores/nimiq-network'

// Avoid warnings regarding additional props/attributes assigned in Flow.vue not being used in this component, and not
// being inheritable as fallback attributes as there is no single root element in this component.
defineOptions({ inheritAttrs: false })

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const state = toRef(props, 'state')
const { withdrawalAddress, topUpAddresses, withdrawalAddressesHistory } = storeToRefs(useApp())
const address = computed(() => {
  const address = withdrawalAddress.value || state.value[StepName.NimAddressInput]

  try {
    return Nimiq.Address.fromString(address).toUserFriendlyAddress()
  }
  catch (e) {
    return ''
  }
})

const { height } = storeToRefs(useNimiqNetwork())
const { formatFiat, formatCrypto } = useCurrencyFormatter()
const { isRemoteOk, isHtlcActive, remoteBalance } = storeToRefs(useRemoteSigner())

const { data, fetch } = useFetch(() => useCurrencyPriceApi().getPriceNow({ currency: Crypto.NIM }))
watch(height, fetch)
const price = computed(() => data.value?.price || 0)

// This component allows the user to either withdraw a specific Fiat amount or all available funds.
// For a successful full withdrawal, it's crucial to know the user's exact fund balance.
// The precision of the set Fiat value directly impacts the accuracy of the fund calculation.
const fiatDecimals = 6

const fiatAmount = ref(0)
const fiatAmountModel = ref(0)
watch(fiatAmount, () => fiatAmountModel.value = Math.floor(fiatAmount.value * 10 ** fiatDecimals))
watch(fiatAmountModel, () => fiatAmount.value = fiatAmountModel.value / 10 ** fiatDecimals)

// JS and their precision issues...
// Lunas are integers, so no problem in rounding down to the nearest integer.
const lunaAmount = computed(() => Math.floor(fiatAmount.value / price.value * 1e5))
const hasEnoughAmount = computed(() => lunaAmount.value <= remoteBalance.value)
const remoteBalanceFiat = computed(() => remoteBalance.value / 1e5 * price.value)

const isSelectOpen = ref(false)
const selected = ref('')
const options = computed(() => [...new Set([address.value, ...withdrawalAddressesHistory.value, ...topUpAddresses.value])])

watch(address, () => {
  selected.value = address.value
}, { immediate: true })

watch(selected, (value) => {
  if (value === 'nim')
    emit('done', '')
  else if (value === 'cc')
  // TODO: add credit card withdrawal
    emit('done', '')

  if (ValidationUtils.isValidAddress(value))
    selected.value = Nimiq.Address.fromString(value).toUserFriendlyAddress()
  else
    selected.value = address.value
})

const errorMessage = computed(() => props.errorMsg || ((!hasEnoughAmount.value && lunaAmount.value > 0) ? i18n.t('Insufficient funds') : ''))
const disabled = computed(() => !selected.value || lunaAmount.value <= 0 || !hasEnoughAmount.value || !(isRemoteOk.value && isHtlcActive.value))
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
})
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full px-2 mt-6 mb-8 gap-y-2">
    <AmountInput v-model="fiatAmountModel" :decimals="fiatDecimals" />
    <p class="max-w-full text-base font-semibold text-space/60">
      {{ formatCrypto(lunaAmount, { currency: Crypto.NIM }) }}
    </p>
  </div>

  <!-- Address Selector -->
  <SelectRoot v-model="selected" @update:open="x => isSelectOpen = x">
    <SelectTrigger
      class="flex gap-x-3 items-center w-11/12 min-w-80 mx-2 p-3 pl-4 text-base font-semibold uppercase border-[1.5px] border-solid rounded border-space-space-400"
      :class="{ 'rounded-b-none': isSelectOpen }"
      :aria-label="$t('Select withdrawal address')"
    >
      <NimiqLogo class="w-6 h-6" />
      <SelectValue :placeholder="address || $t('Select an address…')" class="w-full overflow-hidden text-ellipsis whitespace-nowrap" :class="address ? 'address' : 'normal-case text-left'" />
      <TriangleIcon class="h-[10px] ml-auto will-change-[transform] transition-transform text-space/30" :class="{ 'rotate-90': isSelectOpen }" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="rounded will-change-[opacity,transform] data-[side=bottom]:animate-slideDownAndFade"
        position="popper"
        :side-offset="-4"
        :align-offset="-16"
        style="width: calc(var(--radix-popper-anchor-width) + 32px);"
      >
        <!-- <SelectScrollUpButton class="flex items-center justify-center h-[25px] cursor-default">
          <IonIcon :icon="chevronUp" />
        </SelectScrollUpButton> -->

        <SelectViewport>
          <SelectGroup class="p-1 rounded-md shadow-sm" style="background: radial-gradient(100% 100% at 100% 100%, #260133 0%, #1F2348 100%);">
            <template v-for="option in options" :key="option">
              <!-- We need to have this as hidden, not rendering it causes the Select to break -->
              <SelectItem
                v-if="option"
                class="text-white px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
                :class="{ hidden: option === selected }"
                :value="option"
              >
                <SelectItemText class="block overflow-hidden text-lg uppercase text-ellipsis whitespace-nowrap address">
                  {{ option }}
                </SelectItemText>
              </SelectItem>
            </template>

            <SelectItem
              class="text-white pl-4 pr-2 py-3 leading-4 select-none flex items-center justify-between data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
              value="nim"
              @click.stop="() => $emit('done', '')"
            >
              <SelectItemText class="block overflow-hidden text-lg text-ellipsis whitespace-nowrap">
                {{ $t('Add NIM address') }}
              </SelectItemText>
              <IonIcon :icon="chevronForward" class="w-6 h-6" />
            </SelectItem>
          </SelectGroup>
        </SelectViewport>

        <SelectScrollDownButton class="flex items-center justify-center h-[25px] bg-white text-violet11 cursor-default">
          <IonIcon :icon="chevronDown" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>

  <span class="my-8 text-center text-pumpkin">{{ errorMessage }}</span>

  <div class="flex w-full mt-auto mb-4 justify-evenly">
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 25">
      {{ formatFiat(25, { short: true }) }}
    </button>
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 50">
      {{ formatFiat(50, { short: true }) }}
    </button>
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 100">
      {{ formatFiat(100, { short: true }) }}
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
</template>

<style scoped>
.address {
  font-family: 'Fira Mono', monospace;
  font-weight: 500;
  line-height: 20px;
}
</style>
