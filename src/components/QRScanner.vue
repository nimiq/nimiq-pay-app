<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { PropType, Ref } from 'vue'
import { type State, stepEmits } from '@/types/steps'
import { QRScannerDataFormat, useQRScanner } from '@/composables/useQRScanner'

const props = defineProps({
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  expect: { type: String as PropType<QRScannerDataFormat>, required: true },
})
const emit = defineEmits(stepEmits)

const isDev = import.meta.env.DEV

const videoEl = ref() as Ref<HTMLVideoElement>
const { setDummyData, startScan, stopScan } = useQRScanner({ onScan: data => emit('done', data), expect: props.expect, videoEl })

const observer = new IntersectionObserver(([entry]) => entry.isIntersecting ? startScan() : stopScan(), { threshold: 0.5 })
onMounted(() => observer.observe(videoEl.value))
</script>

<template>
  <div class="relative flex flex-col self-start w-full h-full mt-8">
    <button v-if="isDev && expect !== QRScannerDataFormat.NimCashlink" class="block mb-6 text-sm font-normal underline text-space/80" @click="setDummyData">
      Click here to use mockup data
    </button>
    <div class="relative w-full aspect-square">
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232"><path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" /></svg>
      <video ref="videoEl" class="w-full aspect-square bg-space/10" />
    </div>
  </div>
</template>
