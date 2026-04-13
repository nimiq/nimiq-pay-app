<script setup lang="ts">
import type { PropType } from 'vue'
import type { State } from '@/lib/flows/steps.types'
import { QrCode } from '@nimiq/vue3-components'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, toRef } from 'vue'
import PolygonWarning from '@/components/PolygonWarning.vue'
import { StepName } from '@/lib/flows/steps.types'
import { polygonUsdtConfig } from '@/lib/polygon/config'
import { useApp } from '@/stores/app'

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
const { isNimiqAsset } = storeToRefs(useApp())

const stringToQr = computed(() => {
  const value = props.stringToQr || state.value[StepName.NimAddressDisplay]
  if (typeof value === 'string' && value.startsWith('0x'))
    return `ethereum:${value}@${polygonUsdtConfig.networkId}`
  return value
})
</script>

<template>
  <div class="h-full m-auto mt-[30%] flex flex-col items-center">
    <QrCode :data="stringToQr" :fill="qrCodeFill" :size="qrCodeSize" :radius="qrCodeRadius" :style="{ '--qr-code-canvas-size': `${qrCodeCanvasSize}px` }" />
    <PolygonWarning
      v-if="!isNimiqAsset"
      class="mt-4"
      :message="$t('Make sure you are sending from a Polygon address, or your funds might be permanently lost!')"
      :tooltip-message="$t('The Pay app uses USDT on the Polygon network. Sending funds from a non-Polygon address could result in permanent loss.')"
    />
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
