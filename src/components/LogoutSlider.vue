<script setup lang="ts">
import { ref } from 'vue'
import { IonButton } from '@ionic/vue'
import { useCssVar } from '@vueuse/core'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'

const emit = defineEmits(stepEmits)

const container = ref()
const progress = useCssVar('--progress', container, { initialValue: '0' })

function openBackupFlow() {
  initializeFlow(FlowName.Backup, { closeCurrentModal: false })
}

function onThumbRelease() {
  // detect if the event is triggered by the thumb
  if (Number(progress.value) < 1000) {
    progress.value = '0'
    return
  }

  setTimeout(() => progress.value = '0', 800) // In case we open the backup flow, then reset ui
  emit('done')
}
</script>

<template>
  <div class="w-full flex flex-col justify-end h-full">
    <div ref="container" class="mt-16 w-full max-w-xs mx-auto grid *:row-span-full *:col-span-full">
      <label for="progress" class="h-full grid place-content-center">
        <span class="sr-only">{{ $t('Swipe for') }}</span>
        <span class="text-space/40 uppercase font-bold text-base tracking-wider first-letter:pr-[1px]">{{ $t('Log out') }}</span>
      </label>
      <div class="bg-space/15 w-full h-16 rounded-full p-0.5">
        <div class="h-full aspect-square rounded-full grid place-content-center relative thumb">
          <svg aria-hidden width="24" height="16" viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 1L22.9995 7.89033L16 14.7787" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="22" y1="7.90625" x2="1" y2="7.90625" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
      <input id="progress" v-model="progress" type="range" class="w-full opacity-0" min="0" max="1000" @change="onThumbRelease">
    </div>

    <IonButton fill="clear" class="text-base font-bold normal-case mt-5" style="--padding-top: 8px; --padding-bottom: 8px;" @click="openBackupFlow">
      {{ $t('Show login words') }}
    </IonButton>
  </div>
</template>

<style scoped>
.thumb {
  background: radial-gradient(100% 100% at 100% 100%, #265DD7 0%, #0582CA 100%);
  left: calc(var(--progress) / 1000 * (100% - 60px));

  --timing: linear(0 0%, 0.4322 6.7%, 0.5876 9.63%, 0.7165 12.53%, 0.8238 15.53%, 0.9087 18.63%, 0.9731 21.89%, 1.0188 25.4%, 1.0377 27.67%, 1.0507 30.11%, 1.058 32.77%, 1.0598 35.74%, 1.0528 41.1%, 1.0164 56.54%, 1.004 65.49%, 0.998 78.52%, 1 100%);
  transition: left 700ms;
  transition-timing-function: var(--timing);
}

label {
  opacity: calc(1.25 - (var(--progress) / 1000) * 3);
  scale: clamp(0.9, calc(1.22 - (var(--progress) / 1000)), 1);
  transition: scale 100ms;
  transition-timing-function: var(--timing);
}
</style>
