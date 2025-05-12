<script setup lang="ts">
import type { PropType } from 'vue'
import { type State, StepName } from '@/lib/flows/steps.types'
import { QrCode } from '@nimiq/vue3-components'
import { useWindowSize } from '@vueuse/core'
import { computed, toRef } from 'vue'

const props = defineProps({
  state: { type: Object as PropType<State>, required: true },
  stringToQr: {
    type: String,
  },
  qrCodeSize: {
    type: Number,
    default: 260,
  },
  qrCodeFill: {
    type: String,
    default: '#1F2348',
  },
  qrCodeRadius: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 0.5,
  },
})
const state = toRef(props, 'state')

const { height: windowHeight } = useWindowSize()
const qrCodeCanvasSize = computed(() => Math.min(520, Math.floor(windowHeight.value * 0.95)))
const stringToQr = computed(() => props.stringToQr || state.value[StepName.NimAddressDisplay])
</script>

<template>
  <div class="h-full m-auto mt-[30%]">
    <QrCode :data="stringToQr" :fill="qrCodeFill" :size="qrCodeSize" :radius="qrCodeRadius" :style="{ '--qr-code-canvas-size': `${qrCodeCanvasSize}px` }" />
  </div>
</template>

<style scoped>
.qr-code {
    height: var(--qr-code-canvas-size);
    margin: calc(var(--qr-code-canvas-size) / -4);
    transform: scale(0.5);
    align-self: center;
}
</style>
