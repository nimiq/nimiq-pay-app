<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { type PropType, computed } from 'vue'
import { computedAsync } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import type { Flow } from '@/types/steps'
import { PaymentMethod, StepName, stepEmits } from '@/types/steps'
import { useFiat } from '@/stores/fiat'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<Flow['state']>, required: true } })
const emit = defineEmits(stepEmits)

const { getPriceTag } = useFiat()

const nimAmount = computed(() => (props.state[StepName.QRCodeScanner]?.amount || 0) / 1e5)
const feeNimAmount = computed(() => (props.state[StepName.QRCodeScanner]?.fee || 0) / 1e5)

// TODO Add loading state for the fiat exchange rate
const fiatPriceTags = computedAsync(async () => {
  return {
    amount: await getPriceTag(nimAmount.value),
    fee: await getPriceTag(feeNimAmount.value),
  }
})
</script>

<template>
  <div class="flex flex-col justify-center items-center gap-y-2 mt-8">
    <div class="flex items-center justify-center gap-x-2">
      <span class="text-3xl uppercase text-space/60">{{ fiatPriceTags.amount }}</span>
      <InfoIcon class="w-4 h-4 stroke-2 opacity-40" />
    </div>
    <p class="text-5xl text-center">
      {{ nimAmount }} NIM
    </p>
    <p class="text-base font-semibold text-space/60">
      Fees might apply {{ feeNimAmount > 0 ? '~' : '' }}{{ fiatPriceTags.fee }}
    </p>
  </div>
  <div class="flex flex-col justify-end w-full mt-auto pb-6">
    <IonButton size="large" expand="block" @click="emit('done', PaymentMethod.NIM)">
      Pay
    </IonButton>
  </div>
</template>
