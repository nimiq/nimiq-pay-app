<script setup lang="ts">
import { type ComputedRef, type PropType, computed, nextTick, ref, watchEffect } from 'vue'
import { IonButton, IonRadio, IonRadioGroup } from '@ionic/vue'
import YouTubePlayer from 'youtube-player'
import PlayerStates from 'youtube-player/dist/constants/PlayerStates'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import ModalTemplate from '@/components/ModalTemplate.vue'
import CryptoCityLogo from '@/components/icons/cryptocity-logo.vue'
import { usePoints } from '@/stores/points'
import { i18n } from '@/i18n/i18n-setup'

const props = defineProps({
  task: {
    type: Object as PropType<Task>,
    default: null,
  },
})

const { closeModal } = useModal()
const { setToast } = useToast()
const { claimTask } = usePoints()
const metadata: ComputedRef<TaskMetadata> = computed(() => props.task && props.task.metadata)
const type: ComputedRef<TaskType> = computed(() => metadata.value.type)
const options: ComputedRef<string[]> = computed(() => type.value === 'question' ? metadata.value.options : [])
const videoOptions: ComputedRef<{ id: string; time: number } | null> = computed(() => props.task && type.value === 'yt-video' ? props.task.metadata : null)
const textareaField = ref()
const radioValueChecked = ref('')
const isVideoStarted = ref(false)
const isVideoEnded = ref(false)
const isAlreadyClaimed = ref(false)
const errorMsg = ref('')
const textareaMinLength = 10

watchEffect(() => {
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
            const { data, error } = await claimTask({ id: props.task.id })
            if (error || !data) {
              console.error(error)
              return
            }
            const { task_status } = data
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
  errorMsg.value = ''
  let answer = ''
  if (radioValueChecked.value) {
    const index = options.value.indexOf(radioValueChecked.value)
    answer = String.fromCharCode(97 + index)
  }
  else if (textareaField.value?.value) {
    answer = textareaField.value.value
    if (answer.length < textareaMinLength)
      return errorMsg.value = i18n.t('Please enter at least ten characters')
  }
  if (!answer && type.value !== 'yt-video')
    return
  if (!isAlreadyClaimed.value) {
    const { data, error } = await claimTask({ id: props.task.id, answer })
    if (error || !data) {
      console.error(error)
      return
    }
    const { task_status } = data

    if (task_status === 'rejected') {
      if (type.value === 'yt-video' && isVideoEnded.value)
        errorMsg.value = i18n.t('Please watch the full video')
      else
        errorMsg.value = i18n.t('Wrong answer')
      return
    }
    // Video playing will return in-progress
    if (task_status === 'in-progress')
      return
  }

  setToast({ message: i18n.t('You received Cryptocity Points') })
  closeModal()
}
</script>

<template>
  <ModalTemplate>
    <template #title>
      {{ task.description }}
    </template>
    <div class="self-stretch max-w-[98vw] w-full flex flex-col">
      <i18n-t keypath="You earn {amount}" tag="div" class="flex items-center justify-center text-lg font-bold" :class="{ 'mb-8': type !== 'yt-video' }">
        <template #amount>
          <CryptoCityLogo class="w-5 h-5 ml-2 mr-1" />
          {{ (task.reward_amount / 1e5).toLocaleString() }}
        </template>
      </i18n-t>
      <!-- Text Input -->
      <!-- eslint-disable-next-line vue/html-self-closing -->
      <textarea
        v-if="type === 'text-input'"
        ref="textareaField" :minlength="textareaMinLength" maxlength="1000"
        class="w-full h-full small:h-1/2 tall:h-3/5 p-4 placeholder:text-space/60 border-[1.5px] border-solid rounded-md border-space-space-400"
        :placeholder="$t('We value your opinion. Please enter at least ten characters.')"
        @focus="errorMsg = ''"
      ></textarea>
      <!-- Radio Input -->
      <IonRadioGroup
        v-else-if="type === 'question'"
        @ion-change="(e) => { errorMsg = ''; radioValueChecked = e.detail.value }"
      >
        <IonRadio v-for="(option, index) in [...options].sort(() => Math.random() - 0.5)" :key="option + index" mode="md" label-placement="end" justify="start" :value="option" class="w-full my-2">
          <p class="text-left whitespace-normal text-space/60">
            {{ option }}
          </p>
        </IonRadio>
      </IonRadioGroup>
      <!-- Video -->
      <div
        v-else-if="type === 'yt-video'"
        id="yt-player"
        class="w-full mt-4 mx-auto aspect-[9/16] rounded-md"
        style="height: clamp(25rem, 60vh, 30rem);"
      />
    </div>
    <p v-if="errorMsg" class="text-center text-pumpkin">
      {{ errorMsg }}
    </p>
    <!-- Margin Top needed when the text area is focused, this causes the button to be too close to the text area leaving no space.
      With the margin top it leaves some space to click safely in either the text area or the button -->
    <IonButton class="self-end w-full mt-8" expand="block" strong :disabled="type === 'yt-video' && !isVideoEnded" @click="handleSubmit">
      {{ $t('Submit') }}
    </IonButton>
  </ModalTemplate>
</template>
