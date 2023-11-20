<script setup lang="ts">
import { type PropType, inject, ref } from 'vue'
import { IonIcon, IonRippleEffect, IonSpinner } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { BonusWallet } from '@/lib/bonus-wallet'
import { Modal, useModal } from '@/composables/useModal'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'

const props = defineProps({
  progress: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    default: 0,
  },
  taskName: {
    type: String,
    default: '',
  },
  task: {
    type: Object as PropType<Task>,
    default: null,
  },
  large: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['click'])
const bonusWallet = inject(BonusWallet.KEY) as BonusWallet
const { showModal } = useModal()

const isLoading = ref(false)

async function handleClick() {
  if (props.task?.status === 'completed')
    return
  if (!props.task) {
    emit('click')
    return
  }
  isLoading.value = true
  const task = await bonusWallet.getTask(props.task.id)
  isLoading.value = false
  showModal(Modal.Task, { isOnTop: true, componentProps: { task } })
}
</script>

<template>
  <div
    class="p-4 text-base font-bold rounded-lg min-h-[10rem] relative ion-activatable ripple-parent overflow-hidden w-full shadow-card"
    :class="{ 'opacity-20': task?.status === 'completed' }"
    @click="handleClick"
  >
    <span v-if="total" class="absolute text-sm top-2 right-3">
      {{ progress }}/{{ total }}
    </span>
    <span v-if="task?.status === 'completed'" class="absolute text-sm top-2 right-3">
      Complete
    </span>
    <Transition name="fade" mode="out-in">
      <IonSpinner v-if="isLoading" class="absolute text-white -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" />
      <div v-else class="flex flex-col justify-between h-full gap-y-2">
        <span
          class="font-bold" :class="{ '!text-xl w-3/4': large }"
        >
          <slot />
        </span>
        <div class="flex items-center justify-between text-lg font-light gap-x-2">
          <div v-if="task?.reward_amount" class="flex items-center gap-x-1">
            <CryptoCityLogo class="h-4 w-5 [&>path]:fill-white" />
            <span class="text-base font-normal">
              {{ task.reward_amount / 1e5 }}
            </span>
          </div>
          <IonIcon :icon="chevronForwardOutline" class="ml-auto stroke-2" />
        </div>
      </div>
    </Transition>
    <IonRippleEffect />
  </div>
</template>
