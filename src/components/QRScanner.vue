<script setup lang="ts">
import { type PropType, computed, watch } from 'vue'
import { type State, stepEmits } from '@/lib/flows/steps.types'
import { useQRScanner } from '@/composables/useQRScanner'
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

watch(() => props.isVisible, isVisible => console.log('props isVisible', isVisible))

const isVisible = computed(() => props.isVisible)
watch(isVisible, isVisible => console.log('computed isVisible', isVisible))

const { setDummyData, startScan, stopScan, error, isScanning, data } = useQRScanner({ expect: props.expect })

// Emit when data is available
watch(data, () => data.value && emit('done', data.value))

// Show a toast error message on error
watch(error, () => error.value && useToast().setToast({ message: error.value }))

// Only scan when visible
watch(isVisible, isVisible => isVisible ? startScan() : stopScan())

const isDev = import.meta.env.DEV
</script>

<template>
  <div class="relative flex flex-col self-start w-full h-full mt-8">
    <button v-if="isDev && expect !== QRScannerDataFormat.NimCashlink" class="block mb-6 text-sm font-normal underline text-space/80" @click="setDummyData">
      Click here to use mockup data
    </button>
    <div class="relative w-full aspect-square">
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232"><path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" /></svg>
    </div>
  </div>
</template>
