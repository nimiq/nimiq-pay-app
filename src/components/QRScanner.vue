<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PropType, Ref, computed } from 'vue'
import { type State, stepEmits } from '@/lib/flows/steps.types'
import { type QRScannerData, useQRScanner } from '@/composables/useQRScanner'
import { useToast } from '@/composables/useToast'
import { QRScannerDataFormat } from '@/lib/qr-parsers'

const props = defineProps({
  isVisible: { type: Boolean, required: true },
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  state: { type: Object as PropType<State>, required: true },
  expect: { type: String as PropType<QRScannerDataFormat>, required: true },
})
const emit = defineEmits(stepEmits)

const cameraFeedContainer = ref() as Ref<HTMLDivElement>

const onData = (data: QRScannerData<typeof props.expect>) => emit('done', data)
const onError = (error: string) => useToast().setToast({ message: error })

const { setDummyData, startScan, stopScan } = useQRScanner({ expect: props.expect, cameraFeedContainer, onData, onError })

watch(() => props.isVisible, isVisible => (isVisible) ? startScan() : stopScan())

const isDev = import.meta.env.DEV
</script>

<template>
  <div class="flex flex-col self-start w-full h-full mt-8">
    <button v-if="isDev && expect !== QRScannerDataFormat.NimCashlink" class="z-10 block mb-6 text-sm font-normal underline text-space/80" @click="setDummyData">
      Click here to use mockup data
    </button>

    <div ref="cameraFeedContainer" />
  </div>
</template>
