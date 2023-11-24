<script setup lang="ts">
import { type PropType, onMounted, ref } from 'vue'
import { type State, stepEmits } from '@/types/steps'
import { useQRScanner } from '@/composables/useQRScanner'

defineProps({ errorMsg: { type: String }, canSkip: { type: Boolean }, state: { type: Object as PropType<State>, required: true } })
const emit = defineEmits(stepEmits)

const isDev = import.meta.env.DEV

const { isScanning, setDummyData } = useQRScanner({ onScan: data => emit('done', data) })

const videoContainer = ref<HTMLDivElement>()
const defaultVideoContainerStyles = 'position:absolute; top: 0; left: 0; width:100%; height: 100%; background-color: black;'

/**
 * This function sets up a MutationObserver to watch for changes in the DOM.
 * When the scanner is mounted, it is mounted at the end of the body with an
 * absolute position and covering the whole screen.
 * We just watch the body for changes, and when the scanner is mounted, a
 * specific element (a div with a video and a certain style) is added to the body,
 * it modifies the video's style, moves the video to a different container, and hides the original element.
 */
function relocateVideo() {
  const observer = new MutationObserver(() => {
    const element = document.body.querySelector(`[style="${defaultVideoContainerStyles}"]`) as HTMLDivElement
    if (!element)
      return
    observer.disconnect()
    const video = element.querySelector('video')
    video!.style!.objectFit = 'cover'
    videoContainer.value!.appendChild(video!)
    // remove element from DOM
    element.remove()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

onMounted(relocateVideo)
</script>

<template>
  <div class="flex flex-col self-start w-full h-full relative mt-8">
    <button v-if="isDev" class="block text-sm font-normal text-space/80 underline z-10 mb-6" @click="setDummyData">
      Click here to use mockup data
    </button>
    <div class="relative w-full aspect-square">
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232"><path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" /></svg>
      <div ref="videoContainer" class="w-full aspect-square bg-space/10" />
    </div>
  </div>
</template>
