<script setup lang="ts">
import type { PropType } from 'vue'
import { computed, ref, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import type { State } from '@/types/steps'
import { stepEmits } from '@/types/steps'
import { useRemoteSigner } from '@/stores/remote-signer'

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  isVisible: { type: Boolean },
})
defineEmits(stepEmits)

const address = ref<string>()
watch(() => props.state, ({ nimAddressInput }) => address.value = nimAddressInput || '', { deep: true })

const amount = ref<number>()

const hasEnoughAmount = computed(() => amount.value || 0 * 1e5 <= useRemoteSigner().remoteBalance)

const errorMessage = computed(() => props.errorMsg || (!hasEnoughAmount.value ? 'Not enought funds' : ''))
</script>

<template>
  <button class="bg-pink-400 mb-4" @click="$emit('done', '')">
    CLick here to select address:
  </button>

  <span class="text-pumking">{{ errorMessage }}</span>

  <input v-model="amount" placeholder="amount">

  <div class="flex flex-col justify-center pb-6 mt-auto w-full">
    <IonButton id="present-alert" size="small" class="text-base font-bold" :disabled="!address || amount === 0 || !hasEnoughAmount">
      Withdraw
    </IonButton>
  </div>
</template>
