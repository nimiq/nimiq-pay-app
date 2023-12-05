<script setup lang="ts">
import type { PropType, Ref } from 'vue'
import { computed, ref, toRef } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxRoot, ComboboxSeparator, ComboboxTrigger, ComboboxViewport } from 'radix-vue'
import { chevronForward } from 'ionicons/icons'
import type { State } from '@/types/steps'
import { StepName, stepEmits } from '@/types/steps'
import { useRemoteSigner } from '@/stores/remote-signer'
import AmountInput from '@/components/AmountInput.vue'
import { useFiat } from '@/stores/fiat'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)
const { formatFiat } = useFiat()
const amount: Ref<number | undefined> = ref()
const amountInLuna = computed(() => (amount.value || 0) * 1e5)
const state = toRef(props, 'state')
const address = computed(() => state.value[StepName.NimAddressInput])
const options: string[] = []
const currentPrice = ref(0)

const hasEnoughAmount = computed(() => amount.value || 0 * 1e5 <= useRemoteSigner().remoteBalance)

const errorMessage = computed(() => props.errorMsg || (!hasEnoughAmount.value ? 'Not enough funds' : ''))
const disabled = computed(() => !address.value || amountInLuna.value <= 0 || !hasEnoughAmount.value)

function withdraw() {
  emit('done', { amount: amountInLuna.value, recipient: state.value[StepName.NimAddressInput] })
}
</script>

<template>
  <span class="text-pumpkin">{{ errorMessage }}</span>

  <div class="flex flex-col items-center justify-center mt-6 gap-y-2">
    <AmountInput v-model="amount" />
    <p class="text-base font-semibold text-space/60">
      {{ (((amount || 0) / currentPrice / 100) || 0).toLocaleString() }} NIM
    </p>
  </div>

  <!-- Address Selector -->
  <ComboboxRoot v-model="address" class="relative mx-4 mt-9">
    <ComboboxAnchor class="flex items-center justify-between w-full rounded-t">
      <ComboboxInput class="w-full h-full px-4 py-3 text-base font-medium uppercase outline-none border-space-space-400 focus:border-space-space-400 focus:rounded-b-none" :auto-focus="false" />
      <ComboboxTrigger class="absolute flex items-center right-2">
        <IonIcon :icon="chevronForward" size="large" class="w-6" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent class="absolute z-10 w-full bg-white overflow-hidden rounded-b will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade border-space-space-400 border-2 border-t-0 ">
      <ComboboxViewport>
        <template v-for="(option, index) in options" :key="index">
          <ComboboxItem

            class="text-lg font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
            :value="option"
          >
            <span class="text-lg uppercase">
              {{ option }}
            </span>
          </ComboboxItem>
          <ComboboxSeparator class="h-[1.5px] bg-space-space-400" />
        </template>

        <ComboboxItem
          class="font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
          value="nim"
          @click.stop="() => $emit('done', '')"
        >
          <span class="text-lg">
            Add NIM address
          </span>
        </ComboboxItem>

        <ComboboxSeparator class="h-[1.5px] bg-space-space-400" />
        <ComboboxItem
          class="font-semibold text-space/60 px-4 py-3 leading-4 select-none data-[disabled]:text-space/20 data-[disabled]:pointer-events-none"
          value="cc"
          :disabled="true"
        >
          <span class="text-lg">
            To credit card / bank account
          </span>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>

  <div class="flex mt-auto mb-4 justify-evenly">
    <button class="amount-button">
      {{ formatFiat(25, true) }}
    </button>
    <button class="amount-button">
      {{ formatFiat(50, true) }}
    </button>
    <button class="amount-button">
      {{ formatFiat(100, true) }}
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
