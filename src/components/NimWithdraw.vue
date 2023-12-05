<script setup lang="ts">
import type { PropType } from 'vue'
import { computed, ref } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { StepName, stepEmits } from '@/types/steps'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  isVisible: { type: Boolean },
})
const emit = defineEmits(stepEmits)

const address = computed(() => props.state[StepName.NimAddressInput])

const amount = ref<number>()
const amountInLuna = computed(() => amount.value || 0 * 1e5)
const hasEnoughAmount = computed(() => useRemoteSigner().remoteBalance >= amountInLuna.value)

const errorMessage = computed(() => props.errorMsg || (!hasEnoughAmount.value ? 'Not enought funds' : ''))
const disabled = computed(() => !address.value || amountInLuna.value <= 0 || !hasEnoughAmount.value)

function withdraw() {
  emit('done', { amount: amount.value, recipient: address.value })
}
</script>

<template>
  <button class="bg-pink-400 mb-4" @click="$emit('done', '')">
    CLick here to select address:
  </button>

  <span class="text-pumking">{{ errorMessage }}</span>

  <input v-model="amount" placeholder="amount">

  <div class="flex flex-col justify-center pb-6 mt-auto w-full">
    <IonButton size="small" class="text-base font-bold" :disabled="disabled" @click="withdraw">
      Withdraw
    </IonButton>
  </div>
</template>
