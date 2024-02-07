<script setup lang="ts">
import { type PropType, type Ref, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { stepEmits } from '@/lib/flows/steps.types'
import { QRDataFormat } from '@/composables/useStringParser'
import { useDevice } from '@/composables/useDevice'
import { type QRData, QRScannerState, useQRScanner } from '@/composables/useQRScanner'
import { isDev } from '@/lib/index'

const props = defineProps({
  isVisible: { type: Boolean, required: true },
  errorMsg: { type: String },
  canSkip: { type: Boolean },
  expect: { type: String as PropType<QRDataFormat>, required: true },
})
const emit = defineEmits(stepEmits)

const cameraFeedContainer = ref() as Ref<HTMLDivElement>
const errorMessage = ref('') // last error; could be coming from external prop or from scanning

watch(() => props.errorMsg, msg => errorMessage.value = msg || '', { immediate: true })

const cameraFeedContainerTop = ref(0)
watchEffect(() => {
  if (!props.isVisible)
    return
  let totalOffsetTop = 0
  let element: Element | null = cameraFeedContainer.value
  while (element instanceof HTMLElement) {
    totalOffsetTop += element.offsetTop
    element = element.offsetParent
  }
  cameraFeedContainerTop.value = totalOffsetTop
})

const onData = (data: QRData<typeof props.expect>) => emit('done', data)
const onError = (error: string) => errorMessage.value = error
const { setDummyData, start, stop, state } = useQRScanner({ expect: props.expect, cameraFeedContainer, onData, onError })

const { isWeb } = useDevice()

watch(() => props.isVisible, (isVisible) => {
  if (isVisible) {
    setTimeout(() => {
      if (!props.isVisible)
        return // not visible anymore
      document.body.classList.toggle('native-qr-scanner-modal-open', !isWeb)
      start()
    }, 500)
  }
  else {
    document.body.classList.remove('native-qr-scanner-modal-open')
    stop()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.classList.remove('native-qr-scanner-modal-open')
  stop()
})
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

    <div v-if="isWeb" ref="cameraFeedContainer" class="relative aspect-square pointer-events-none" :class="{ 'bg-space/20 animate-pulse': state !== QRScannerState.Scanning }">
      <video autoplay muted playsinline :controls="false" :class="{ 'opacity-0': state !== QRScannerState.Scanning }" />
      <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
        <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
      </svg>
    </div>
    <div v-else ref="cameraFeedContainer" class="absolute inset-0 grid place-content-center pointer-events-none">
      <!-- On native, the camera is visible behind the webview. Put a transparent square in the center of the screen,
      through which the camera can be seen (other parent / background elements are made transparent in useCamerFeed),
      with a wide white border to cover the rest. -->
      <div class="relative w-screen" style="border: 48px solid white; border-top-width: 50vh; border-bottom-width: 50vh" :style="`top: -${cameraFeedContainerTop / 2}px`">
        <div class="aspect-square">
          <svg class="absolute -inset-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 232 232">
            <path stroke="#1F2348" stroke-width="2" d="M1 21V1M0 1h20M211 1h20M231 0v20M231 211v20M232 231h-20M21 230H1M1 231v-20" />
          </svg>
        </div>
      </div>
    </div>

    <p v-if="errorMessage" class="mx-auto mt-8 text-center text-pumpkin small:leading-5" :class="{ 'absolute inset-x-8 bottom-8 small:inset-x-6 small:bottom-4': !isWeb }">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style>
/* Non-scoped style on purpose, as we're manipulating parent elements (in an admittedly hacky fashion, which likely
still is better though than assigning styles via js) */

body.native-qr-scanner-modal-open ion-app > div {
  display: none;
}
body.native-qr-scanner-modal-open ion-modal {
  --ion-backdrop-color: transparent; /* make backdrop transparent */
  --background: transparent; /* make dialog background transparent */
  --overflow: visible; /* make ::before element defined below visible */
}
body.native-qr-scanner-modal-open ion-modal .ion-page::before {
  /* Simulate backdrop above modal. This area is typically var(--ion-safe-area-top) + 10px big (via definition of
  --height on ion-modal), but a larger area is visible when the user drags the modal down to close it. */
  content: '';
  position: absolute;
  width: 100%;
  height: 10%;
  bottom: 100%;
  background: #a9a9a9;
}
body.native-qr-scanner-modal-open ion-modal ion-header {
  background: white; /* avoid video shining through transparent paddings in header */
}
</style>
