<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonButton } from '@ionic/vue'
import { useDraggable } from '@vueuse/core'
import { initializeFlow } from '@/lib/flows'
import { FlowName, stepEmits } from '@/lib/flows/steps.types'

const emit = defineEmits(stepEmits)

function openBackupFlow() {
  initializeFlow(FlowName.Backup, { closeCurrentModal: false })
}

const thumb = ref<HTMLElement>()
const track = ref<HTMLElement>()

const { style, isDragging, position } = useDraggable(thumb, { axis: 'x', containerElement: track })

watch(position, () => position.value.x = Math.min(position.value.x, 260))
watch(isDragging, () => {
  thumb.value?.style.setProperty('transition-duration', isDragging.value ? '700ms' : '300ms')
  if (isDragging.value)
    return
  if (position.value.x > 259) {
    emit('done')
    setTimeout(() => position.value.x = 0, 800) // In case we open the backup flow, then reset ui
    return
  }
  position.value.x = 0
})
</script>

<template>
  <div class="w-full flex flex-col justify-end h-full">
    <div class="mt-16 w-full max-w-xs mx-auto grid *:row-span-full *:col-span-full">
      <label class="h-full grid place-content-center">
        <span class="sr-only">{{ $t('Swipe for') }}</span>
        <span class="text-space/40 uppercase font-bold text-base tracking-wider first-letter:pr-[1px]">{{ $t('Log out') }}</span>
      </label>
      <div ref="track" class="bg-space/15 w-full h-16 rounded-full p-0.5 relative track">
        <div class="bg-[#dedee4] absolute inset-y-0 left-6 z-10 curtain" :style="`width: ${position.x}px`" />
        <div ref="thumb" class="rounded-full grid place-content-center relative thumb h-[60px] aspect-square z-10" :style="style">
          <svg aria-hidden width="24" height="16" viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 1L22.9995 7.89033L16 14.7787" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="22" y1="7.90625" x2="1" y2="7.90625" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </div>

    <IonButton fill="clear" class="text-base font-bold normal-case mt-5" style="--padding-top: 8px; --padding-bottom: 8px;" @click="openBackupFlow">
      {{ $t('Show login words') }}
    </IonButton>
  </div>
</template>

<style scoped>
.track {
  --timing: linear(0 0%, 0.4322 6.7%, 0.5876 9.63%, 0.7165 12.53%, 0.8238 15.53%, 0.9087 18.63%, 0.9731 21.89%, 1.0188 25.4%, 1.0377 27.67%, 1.0507 30.11%, 1.058 32.77%, 1.0598 35.74%, 1.0528 41.1%, 1.0164 56.54%, 1.004 65.49%, 0.998 78.52%, 1 100%);
}

.thumb {
  background: radial-gradient(100% 100% at 100% 100%, #265DD7 0%, #0582CA 100%);
  transition: left 300ms;
  transition-timing-function: var(--timing);
}

.curtain {
  transition: width 300ms;
  transition-timing-function: var(--timing);
}
</style>
