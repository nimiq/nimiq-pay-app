<script setup lang="ts">
import { type PropType, inject, ref } from 'vue'
import { IonIcon, IonRippleEffect, IonSpinner } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'
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
  highlight: {
    type: Boolean,
    default: false,
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
  showModal(ModalType.Task, { componentProps: { task } })
}
</script>

<template>
  <div
    class="p-4 pr-10 text-xl font-semibold text-blue-600 bg-blue-100 rounded-lg min-h-[10rem] relative ion-activatable ripple-parent overflow-hidden w-full"
    :class="{
      '[&>*]:text-blue-50 bg-blue-500': highlight,
      'bg-gray-200 text-white': task?.status === 'completed',
    }"
    @click="handleClick"
  >
    <IonIcon :icon="chevronForwardOutline" size="large" class="absolute right-0 bottom-2" />
    <span v-if="total" class="absolute text-sm top-2 right-3">
      {{ progress }}/{{ total }}
    </span>
    <span v-if="task?.status === 'completed'" class="absolute text-sm top-2 right-3">
      Complete
    </span>
    <Transition name="fade" mode="out-in">
      <IonSpinner v-if="isLoading" class="absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" />
      <div v-else class="flex flex-col gap-y-2">
        <h2
          class="text-lg font-semibold" :class="{
            'text-blue-50 !font-bold': highlight,
            '!text-xl w-3/4': large,
            'text-white': task?.status === 'completed',
          }"
        >
          <slot />
        </h2>
        <div v-if="task?.reward_amount" class="flex flex-col justify-start text-lg font-light gap-x-2" :class="{ 'text-white': task?.status === 'completed' }">
          <span>You earn</span>
          <div class="flex items-center gap-x-1">
            <CryptoCityLogo class="h-5" />
            <span>
              {{ task.reward_amount / 1e5 }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
    <IonRippleEffect />
  </div>
</template>
