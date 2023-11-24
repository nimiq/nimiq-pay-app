<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { type PropType, computed } from 'vue'
import { computedAsync } from '@vueuse/core'
import InfoIcon from '@/components/icons/info.vue'
import type { State } from '@/types/steps'
import { StepName, stepEmits } from '@/types/steps'
import { useFiat } from '@/stores/fiat'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const { getPriceTag } = useFiat()

const state = computed(() => props.state[StepName.QRCodeScanner])
const amount = computed(() => state.value?.amount || 0)
const fee = computed(() => state.value?.fee || 0)
const nimAmount = computed(() => amount.value / 1e5)
const feeNimAmount = computed(() => fee.value / 1e5)
const fiatPriceTag = computedAsync(() => getPriceTag(amount.value))
</script>

<template>
  <div class="grid w-full h-full grid-rows-[2fr_1fr]">
    <div class="flex flex-col items-center self-start">
      <div class="flex flex-col justify-center gap-y-2">
        <div v-if="fiatPriceTag" class="flex items-center justify-center gap-x-2">
          <span class="text-3xl uppercase text-space/60">{{ fiatPriceTag }}</span>
          <InfoIcon class="w-4 h-4 stroke-2 opacity-60" />
        </div>
        <p class="text-5xl">
          {{ nimAmount }} NIM
        </p>
        <p class="text-base font-semibold text-space/60">
          Fees might apply ~{{ feeNimAmount }} NIM
        </p>
        <!-- Cashback -->
        <Transition name="slide-fade" mode="out-in" />
      </div>
    </div>
    <div class="flex flex-col items-center self-end justify-between w-full h-full">
      <IonButton size="large" expand="block" class="w-11/12 max-w-xs min-w-[10rem]" @click="emit('done')">
        Pay
      </IonButton>
    </div>
  </div>
</template>
