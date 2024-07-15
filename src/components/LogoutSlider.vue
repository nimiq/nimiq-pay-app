<script setup lang="ts">
import { IonButton } from '@ionic/vue'
import { ref, watch } from 'vue'
import { TransitionPresets, executeTransition, useCssVar } from '@vueuse/core'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'

const emit = defineEmits(stepEmits)
const container = ref<HTMLInputElement | null>(null)
const progress = ref(0)
const progressCss = useCssVar('--progress', container, { initialValue: '0' })

watch(progress, (value) => {
  progressCss.value = value.toString()
})

function openBackupFlow() {
  initializeFlow(FlowName.Backup, { closeCurrentModal: false })
}

async function onThumbRelease() {
  // Detect if the event is triggered by the thumb
  if (progress.value < 100) {
    const from = progress.value
    await executeTransition(progress, from, 0, {
      duration: 250,
      transition: TransitionPresets.easeInOutSine,
    })
  }

  // In case we open the backup flow, then reset ui
  setTimeout(() => progress.value = 0, 800)
  // emit('done')
}
</script>

<template>
  <div class="w-full h-full flex flex-col justify-end">
    <div ref="container" class="mx-auto w-full max-w-xs grid mt-16 *:col-span-full *:row-span-full">
      <label for="progress" class="z-10 grid place-content-center pointer-events-none">
        <span class="sr-only">{{ $t('Swipe for') }}</span>
        <span class="text-space/40 text-base font-bold tracking-wider uppercase first-letter:pr-[1px]">{{ $t('Log out') }}</span>
      </label>
      <svg
        class="w-7 h-16 z-10 pointer-events-none"
        aria-hidden viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg"
        style="margin-left: calc(18px + var(--progress) / 100 * (100% - 60px));"
      >
        <path d="M16 1L22.9995 7.89033L16 14.7787" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="22" y1="7.90625" x2="1" y2="7.90625" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <input
        id="slider"
        type="range"
        :value="progress"
        @input="progress = Number(($event.target as HTMLInputElement).value)"
        @change="onThumbRelease"
      >
    </div>

    <IonButton
      fill="clear" class="my-5 text-base font-bold normal-case"
      style="--padding-top: 8px; --padding-bottom: 8px;" @click="openBackupFlow"
    >
      {{ $t('Show login words') }}
    </IonButton>
  </div>
</template>

<style scoped>
input[type="range"] {
  --height: 4rem;
  outline: 0;
  border: 0;
  border-radius: 220px;
  width: 100%;
  transition: box-shadow 0.2s ease-in-out;
  appearance: none;
  height: var(--height);
  overflow: hidden;
  background-color: #ddd;

  &::-webkit-slider-runnable-track {
    appearance: none;
    height: var(--height);
    transition: box-shadow 0.2s ease-in-out;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: var(--height);
    height: var(--height);
    box-shadow: -350px 0 0 320px #0582CA;
    border-radius: 50%;
    transition: box-shadow 0.2s ease-in-out;
    position: relative;
    background: radial-gradient(100% 100% at 100% 100%, #265DD7 0%, #0582CA 100%);
  }
}

label {
  opacity: calc(1.25 - (var(--progress) / 100) * 3);
  scale: max(calc(1 - (var(--progress) / 100)), 0.5);
  transition: scale 100ms;
  transition-timing-function: var(--timing);
}
</style>
