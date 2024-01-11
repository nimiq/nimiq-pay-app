<script setup lang="ts">
import { type PropType, type Ref, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { type State, stepEmits } from '@/lib/flows/steps.types'
import { useToast } from '@/composables/useToast'
import { QRDataFormat } from '@/composables/useStringParser'
import { useDevice } from '@/composables/useDevice'
import { type QRData, QRScannerState, useQRScanner } from '@/composables/useQRScanner'

const props = defineProps({
  isVisible: { type: Boolean, required: true },
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  expect: { type: String as PropType<QRDataFormat>, required: true },
})
const emit = defineEmits(stepEmits)

const cameraFeedContainer = ref() as Ref<HTMLDivElement>

const onData = (data: QRData<typeof props.expect>) => emit('done', data)
const onError = (error: string) => useToast().setToast({ message: error, error: true })
const { setDummyData, start, stop, state } = useQRScanner({ expect: props.expect, cameraFeedContainer, onData, onError })

watch(() => props.isVisible, isVisible => (isVisible) ? setTimeout(start, 500) : nextTick(stop), { immediate: true })

const isDev = import.meta.env.DEV
const { isWeb } = useDevice()

onBeforeUnmount(stop)
</script>

<template>
  <div class="mt-8 px-0.5">
    <button v-if="isDev && expect !== QRDataFormat.NimCashlink" class="z-10 block w-full mb-6 text-sm font-normal text-center underline text-space/80" :class="{ 'absolute -translate-x-1/2 left-1/2': !isWeb }" @click="setDummyData">
      Click here to use mockup data
    </button>

    <div v-if="isWeb" ref="cameraFeedContainer" class="relative aspect-square" :class="{ 'bg-space/20 animate-pulse': state !== QRScannerState.Scanning }">
      <video autoplay muted playsinline :controls="false" :class="{ 'opacity-0': state !== QRScannerState.Scanning }" />
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
        <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
      </svg>
    </div>
    <div v-else ref="cameraFeedContainer" class="absolute inset-0 grid place-content-center">
      <div class="relative w-screen" style="--px: 48px; border: var(--px) solid white; border-top-width: calc(50vh - var(--px)); border-bottom-width: calc(50vh - var(--px));">
        <div class="aspect-square">
          <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
            <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
