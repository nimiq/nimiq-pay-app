<script setup lang="ts">
import type { PropType, Ref } from 'vue'
import { computed, ref, toRef, watch } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
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
import { chevronForward } from 'ionicons/icons'
import { storeToRefs } from 'pinia'
import type { State } from '@/types/steps'
import { StepName, stepEmits } from '@/types/steps'
import { useRemoteSigner } from '@/stores/remote-signer'
import { useApp } from '@/stores/app'
import AmountInput from '@/components/AmountInput.vue'
import NimiqLogo from '@/components/icons/nimiq-logo.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)
const { formatFiat } = useCurrencyFormatter()
const amount: Ref<number | undefined> = ref()
const amountInLuna = computed(() => (amount.value || 0) * 1e5)
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

const isSelectOpen = ref(false)
const selected = ref('')
const options = computed(() => [address.value])
const currentPrice = ref(0)

watch(address, () => {
  selected.value = address.value
})

watch(selected, (value) => {
  if (value === 'nim')
    emit('done', '')
  else if (value === 'cc')
  // TODO: add credit card withdrawal
    emit('done', '')

  selected.value = address.value
})

const hasEnoughAmount = computed(() => amount.value || 0 * 1e5 <= useRemoteSigner().remoteBalance)

const errorMessage = computed(() => props.errorMsg || (!hasEnoughAmount.value ? 'Not enough funds' : ''))
const disabled = computed(() => !address.value || amountInLuna.value <= 0 || !hasEnoughAmount.value)

function withdraw() {
  emit('done', { amount: amountInLuna.value, recipient: state.value[StepName.NimAddressInput] })
}
</script>

<template>
  <span class="text-pumpkin">{{ errorMessage }}</span>

  <div class="flex flex-col items-center justify-center mt-6 mb-8 gap-y-2">
    <AmountInput v-model="amount" />
    <p class="text-base font-semibold text-space/60">
      {{ (((amount || 0) / currentPrice / 100) || 0).toLocaleString() }} NIM
    </p>
  </div>

  <!-- Address Selector -->
  <SelectRoot v-model="selected" @update:open="x => isSelectOpen = x">
    <SelectTrigger
      class="flex gap-x-3 items-center w-full p-3 pl-4 text-base font-semibold uppercase border-[1.5px] border-solid rounded border-space-space-400 relative"
      :class="{ 'rounded-b-none': isSelectOpen }"
      aria-label="Select withdrawal address"
    >
      <NimiqLogo class="w-6 h-6" />
      <SelectValue :placeholder="address || 'Select an address...'" class="w-full overflow-hidden text-ellipsis whitespace-nowrap" :class="{ 'normal-case text-left': !address }" />
      <IonIcon :icon="chevronForward" size="large" class="w-6 h-full ml-auto will-change-[transform] transition-transform" :class="{ 'rotate-90': isSelectOpen }" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="border-[1.5px] border-t-0 rounded-t-none border-solid rounded border-space-space-400 will-change-[opacity,transform] data-[side=top]:animate-slideUpAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideDownAndFade data-[side=left]:animate-slideRightAndFade z-[100]"
        position="popper"
        style="width: var(--radix-select-trigger-width);"
      >
        <SelectScrollUpButton class="flex items-center justify-center h-[25px] bg-white text-violet11 cursor-default">
          <Icon icon="radix-icons:chevron-up" />
        </SelectScrollUpButton>

        <SelectViewport>
          <SelectGroup>
            <template
              v-for="(option, index) in options"
              :key="index"
            >
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
                Add NIM address
              </SelectItemText>
            </SelectItem>
            <SelectSeparator class="h-[1.5px] bg-space-space-400" />

            <SelectItem
              class="text-lg font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
              value="cc"
              :disabled="true"
            >
              <SelectItemText class="block overflow-hidden text-lg text-ellipsis whitespace-nowrap">
                To credit card / bank account
              </SelectItemText>
            </SelectItem>
          </SelectGroup>
        </SelectViewport>

        <SelectScrollDownButton class="flex items-center justify-center h-[25px] bg-white text-violet11 cursor-default">
          <Icon icon="radix-icons:chevron-down" />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>

  <div class="flex mt-auto mb-4 justify-evenly">
    <button class="amount-button">
      {{ formatFiat(25, { short: true }) }}
    </button>
    <button class="amount-button">
      {{ formatFiat(50, { short: true }) }}
    </button>
    <button class="amount-button">
      {{ formatFiat(100, { short: true }) }}
    </button>
    <button class="amount-button">
      All
    </button>
  </div>

  <div class="flex flex-col justify-center w-full pb-6">
    <IonButton id="present-alert" size="small" class="text-base font-bold" :disabled="disabled" @click="withdraw">
      Withdraw
    </IonButton>
  </div>
</template>

<style scoped>
.amount-button {
 @apply px-4 py-2 text-base font-bold rounded-full bg-space-space-100 text-space/60
}
</style>
