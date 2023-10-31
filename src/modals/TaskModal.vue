<script setup lang="ts">
import { computed, inject, nextTick, ref, watchEffect } from 'vue'
import type { ComputedRef, PropType, Ref } from 'vue'
import { IonButton, IonRadio, IonRadioGroup } from '@ionic/vue'
import YouTubePlayer from 'youtube-player'
import PlayerStates from 'youtube-player/dist/constants/PlayerStates'
import { BonusWallet } from '@/lib/bonus-wallet'
import { ModalType, useModal } from '@/composables/useModal'
import ModalTemplate from '@/components/ModalTemplate.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'

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
const videoOptions: ComputedRef<{ id: string; time: number } | null> = computed(() => props.task && type.value === 'yt-video' ? JSON.parse(props.task.metadata) : null)
const inputField = ref()
const radioValueChecked = ref('')
const isVideoStarted = ref(false)
const isVideoEnded = ref(false)
const isAlreadyClaimed = ref(false)

watchEffect(() => {
  console.log(videoOptions.value)
  if (videoOptions.value) {
    nextTick(() => {
      const player = YouTubePlayer('yt-player', {
        height: 'auto',
        width: 'auto',
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          fs: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
        },
      })
      player.cueVideoById(videoOptions.value!.id)
      player.setVolume(100)
      player.on('stateChange', async ({ data }: { data: PlayerStates }) => {
        if (data === PlayerStates.PLAYING && !isVideoStarted.value) {
          isVideoStarted.value = true
          try {
            const { task_status } = await bonusWallet.claimTask(props.task.id, {})
            if (task_status === 'completed')
              isAlreadyClaimed.value = true
          }
          catch (e: any) {
            // TODO: error handling
            isAlreadyClaimed.value = true
          }
        }
        else if (data === PlayerStates.ENDED) {
          isVideoEnded.value = true
        }
      })
    })
  }
})

async function handleSubmit() {
  let answer = ''
  if (radioValueChecked.value) {
    const index = options.value.indexOf(radioValueChecked.value)
    answer = String.fromCharCode(97 + index)
  }
  else if (inputField.value?.value) {
    answer = inputField.value.value
  }
  if (!answer && type.value !== 'yt-video')
    return
  if (!isAlreadyClaimed.value) {
    const { task_status } = await bonusWallet.claimTask(props.task.id, { answer })
    // TODO: show error and handle errors
    if (task_status !== 'completed')
      return
  }

  await showNotificationAlert({ title: `You earned ${props.task.reward_amount / 1e5} CC Points` })
  showModal(ModalType.Rewards)
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ task.description }}
    </template>
    <div class="self-stretch max-w-[98vw]">
      <div class="text-center" :class="{ 'mb-8': type !== 'yt-video' }">
        <span>You earn</span>
        <div class="flex items-center justify-center mt-2">
          <CryptoCityLogo class="h-8 mr-2" />
          <span class="text-4xl">{{ task.reward_amount / 1e5 }}</span>
        </div>
      </div>
      <input v-if="type === 'text-input'" ref="inputField" min="10" max="1000">
      <IonRadioGroup v-else-if="type === 'question'" @ion-change="(e) => radioValueChecked = e.detail.value">
        <IonRadio v-for="(option, index) in [...options].sort(() => Math.random() - 0.5)" :key="option + index" label-placement="end" justify="start" :value="option" class="w-full my-2">
          <p class="text-left whitespace-normal">
            {{ option }}
          </p>
        </IonRadio>
      </IonRadioGroup>
      <div v-else-if="type === 'yt-video'" id="yt-player" class="w-[calc(100%+80px*2)] mt-4 -ml-20 aspect-[9/16] rounded-md" style="height: clamp(25rem, 60vh, 30rem);" />
    </div>
    <IonButton class="self-end w-full" expand="block" strong :disabled="type === 'yt-video' && !isVideoEnded" @click="handleSubmit">
      Submit
    </IonButton>
  </ModalTemplate>
</template>
