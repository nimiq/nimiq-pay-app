<script setup lang="ts">
import { type PropType, type Ref, onBeforeUnmount, ref, watch } from 'vue'
import { type State, stepEmits } from '@/lib/flows/steps.types'
import { useToast } from '@/composables/useToast'
import { QRDataFormat } from '@/composables/useStringParser'
import { useDevice } from '@/composables/useDevice'
import { type QRData, QRScannerState, useQRScanner } from '@/composables/useQRScanner'
import { isDev } from '@/lib/index'

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

watch(() => props.isVisible, (isVisible) => {
  if (isVisible) {
    setTimeout(() => {
      if (!props.isVisible)
        return // not visible anymore
      start()
    }, 500)
  }
  else {
    stop()
  }
}, { immediate: true })

const { isWeb } = useDevice()

onBeforeUnmount(stop)
</script>

<template>
  <div class="mt-8 px-0.5">
    <div v-if="isDev && expect !== QRDataFormat.NimCashlink" class="flex flex-col items-center mb-6" :class="{ 'absolute z-10  -translate-x-1/2 left-1/2': !isWeb }">
      <button class="block w-full text-sm font-normal text-center underline text-space/80" @click="setDummyData">
        Click here to use mockup data.<br>
      </button>
      <span class="mt-2 text-xs text-center opacity-70">
        <!-- The payment reference, used to fetch the price from the CPL API, is tied to the original payment value (e.g., 100NIM). If the value is later changed (e.g., to 1NIM for testing), the fetched price will still correspond to the original value, leading to incorrect pricing. -->
        It is <b>expected</b> that data in preview might be wrong
      </span>
    </div>

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
