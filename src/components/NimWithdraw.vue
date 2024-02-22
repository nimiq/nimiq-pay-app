<script setup lang="ts">
import { type PropType, computed, ref, toRef, watch } from 'vue'
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue'
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'radix-vue'
import { chevronDown, chevronForward, chevronUp } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import { type State, StepName, stepEmits } from '@/lib/flows/steps.types'
import { useRemoteSigner } from '@/stores/remote-signer'
import { Crypto, useApp } from '@/stores/app'
import AmountInput from '@/components/AmountInput.vue'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
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
const { withdrawalAddress } = storeToRefs(useApp())
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
const lunaAmount = computed(() => fiatAmount.value / (10 ** fiatDecimals) / price.value * 1e5)

const hasEnoughAmount = computed(() => lunaAmount.value <= remoteBalance.value)

const remoteBalanceFiat = computed(() => remoteBalance.value * price.value / 1e5 * (10 ** fiatDecimals))

const isSelectOpen = ref(false)
const selected = ref('')
const options = computed(() => [address.value])

watch(address, () => {
  selected.value = address.value
}, { immediate: true })

watch(selected, (value) => {
  if (value === 'nim')
    emit('done', '')
  else if (value === 'cc')
  // TODO: add credit card withdrawal
    emit('done', '')

  selected.value = address.value
})

const errorMessage = computed(() => props.errorMsg || ((!hasEnoughAmount.value && lunaAmount.value > 0) ? i18n.t('Insufficient funds') : ''))
const disabled = computed(() => !address.value || lunaAmount.value <= 0 || !hasEnoughAmount.value || !(isRemoteOk.value && isHtlcActive.value))
const loading = ref(false)

function withdraw() {
  if (loading.value)
    return

  loading.value = true
  emit('done', { amount: lunaAmount.value, recipient: selected.value })
}
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full px-8 mt-6 mb-8 gap-y-2">
    <AmountInput v-model="fiatAmount" :decimals="fiatDecimals" />
    <p class="max-w-full text-base font-semibold text-space/60">
      {{ formatCrypto(lunaAmount) }}
    </p>
  </div>

  <!-- Address Selector -->
  <SelectRoot v-model="selected" @update:open="x => isSelectOpen = x">
    <SelectTrigger
      class="flex gap-x-3 items-center w-full p-3 pl-4 text-base font-semibold uppercase border-[1.5px] border-solid rounded border-space-space-400 relative"
      :class="{ 'rounded-b-none': isSelectOpen }"
      :aria-label="$t('Select withdrawal address')"
    >
      <NimiqLogo class="w-6 h-6" />
      <SelectValue :placeholder="address || $t('Select an address…')" class="w-full overflow-hidden text-ellipsis whitespace-nowrap" :class="{ 'normal-case text-left': !address }" />
      <IonIcon :icon="chevronForward" size="large" class="w-6 h-full ml-auto will-change-[transform] transition-transform" :class="{ 'rotate-90': isSelectOpen }" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="border-[1.5px] bg-white border-t-0 rounded-t-none border-solid rounded border-space-space-400 will-change-[opacity,transform] data-[side=top]:animate-slideUpAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideDownAndFade data-[side=left]:animate-slideRightAndFade z-[100]"
        position="popper"
        style="width: var(--radix-select-trigger-width);"
      >
        <SelectScrollUpButton class="flex items-center justify-center h-[25px] bg-white text-violet11 cursor-default">
          <IonIcon :icon="chevronUp" />
        </SelectScrollUpButton>

        <SelectViewport>
          <SelectGroup>
            <template v-for="option in options" :key="option">
              <!-- We need to have this as hidden, not rendering it causes the Select to break -->
              <SelectItem
                v-if="option"
                class="text-lg font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
                :class="{ hidden: option === address }"
                :value="option"
              >
                <SelectItemText class="block overflow-hidden text-lg uppercase text-ellipsis whitespace-nowrap">
                  {{ option }}
                </SelectItemText>
              </SelectItem>
              <SelectSeparator v-if="option !== address" class="h-[1.5px] bg-space-space-400" />
            </template>

            <SelectItem
              class="text-lg font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
              value="nim"
              @click.stop="() => $emit('done', '')"
            >
              <SelectItemText class="block overflow-hidden text-lg text-ellipsis whitespace-nowrap">
                {{ $t('Add NIM address') }}
              </SelectItemText>
            </SelectItem>
            <SelectSeparator class="h-[1.5px] bg-space-space-400" />

            <SelectItem
              class="text-lg font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
              value="cc"
              :disabled="true"
            >
              <SelectItemText class="block overflow-hidden text-lg text-ellipsis whitespace-nowrap">
                {{ $t('To credit card / bank account') }}
              </SelectItemText>
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
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 25 * 10 ** fiatDecimals">
      {{ formatFiat(25, { short: true }) }}
    </button>
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 50 * 10 ** fiatDecimals">
      {{ formatFiat(50, { short: true }) }}
    </button>
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = 100 * 10 ** fiatDecimals">
      {{ formatFiat(100, { short: true }) }}
    </button>
    <button class="px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60" @click="() => fiatAmount = remoteBalanceFiat">
      {{ $t('All') }}
    </button>
  </div>

  <div class="flex flex-col justify-center w-full pb-6">
    <IonButton id="present-alert" size="small" class="text-base font-bold [&_ion-spinner]:h-4" :disabled="disabled" @click="withdraw">
      <transition
        mode="out-in"
        enter-active-class="transition duration-100 ease-out origin-bottom"
        enter-from-class="scale-95 translate-y-4 opacity-0 rotate-x-[-45deg]"
        enter-to-class="scale-100 translate-y-0 opacity-100 rotate-x-0"
        leave-active-class="transition duration-75 ease-out origin-top"
        leave-from-class="scale-100 translate-y-0 opacity-100 rotate-x-0"
        leave-to-class="scale-95 -translate-y-4 opacity-0 rotate-x-[-45deg] "
      >
        <IonSpinner v-if="loading" name="dots" />
        <span v-else>{{ $t('Send') }}</span>
      </transition>
    </IonButton>
  </div>
</template>
