<script setup lang="ts">
import type { PropType } from 'vue'
import { computed, ref, toRef } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { StepName, stepEmits } from '@/types/steps'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const state = toRef(props, 'state')
const address = computed(() => state.value[StepName.NimAddressInput])

const amount = ref<number>()
const amountInLuna = computed(() => (amount.value || 0) * 1e5)
const hasEnoughAmount = computed(() => useRemoteSigner().remoteBalance >= amountInLuna.value)

const errorMessage = computed(() => props.errorMsg || (!hasEnoughAmount.value ? 'Not enought funds' : ''))
const disabled = computed(() => !address.value || amountInLuna.value <= 0 || !hasEnoughAmount.value)

function withdraw() {
  emit('done', { amount: amountInLuna.value, recipient: state.value[StepName.NimAddressInput] })
}
</script>

<template>
  <button class="mb-4 bg-pink-400" @click="$emit('done', '')">
    CLick here to select address:
  </button>

  <span class="text-pumking">{{ errorMessage }}</span>

  <input v-model="amount" placeholder="amount">

  {{ JSON.stringify({
    address,
    amount,
    amountInLuna,
    hasEnoughAmount,
    remoteBalance: useRemoteSigner().remoteBalance,
  }, null, 2) }}

  <div class="flex flex-col justify-center w-full pb-6 mt-auto">
    <IonButton size="small" class="text-base font-bold" :disabled="disabled" @click="withdraw">
      Withdraw
    </IonButton>
  </div>
</template>
