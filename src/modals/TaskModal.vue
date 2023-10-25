<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { ComputedRef, PropType } from 'vue'
import { IonButton, IonRadio, IonRadioGroup } from '@ionic/vue'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'

const props = defineProps({
  task: {
    type: Object as PropType<Task>,
    default: null,
  },
})

const { showModal, showNotificationAlert } = useModal()
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const type: ComputedRef<TaskType> = computed(() => props.task ? JSON.parse(props.task.metadata).type : '')
const options: ComputedRef<string[]> = computed(() => props.task && type.value === 'question' ? JSON.parse(props.task.metadata).options : '')
const inputField = ref()
const radioValueChecked = ref('')

async function handleSubmit() {
  let answer = ''
  if (radioValueChecked.value) {
    const index = options.value.indexOf(radioValueChecked.value)
    answer = String.fromCharCode(97 + index)
  }
  else if (inputField.value?.value) {
    answer = inputField.value.value
  }
  if (!answer)
    return
  const { task_status } = await bonusWallet.claimTask(props.task.id, { answer })
  if (task_status === 'completed') {
    await showNotificationAlert({ title: `You earned ${props.task.reward_amount / 1e5} CC Points` })
    showModal(ModalType.Rewards)
  }
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ task.description }}
    </template>
    <div class="self-start">
      <p class="mb-16 text-center">
        You earn
        <br>
        <span class="text-4xl">{{ task.reward_amount / 1e5 }} NIM</span>
      </p>
      <input v-if="type === 'text-input'" ref="inputField" min="10" max="1000">
      <IonRadioGroup v-else @ion-change="(e) => radioValueChecked = e.detail.value">
        <IonRadio v-for="(option, index) in [...options].sort(() => Math.random() - 0.5)" :key="option + index" label-placement="end" justify="start" :value="option" class="w-full my-2">
          {{ option }}
        </IonRadio>
      </IonRadioGroup>
    </div>
    <IonButton class="self-end w-full" expand="block" strong @click="handleSubmit">
      Submit
    </IonButton>
  </ModalTemplate>
</template>
